/* Autor: Marius Middrup / Julius Vollmer (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { requirePermission, roleHasPermission, PERMISSIONS } from '../middleware/permissions.js';
import { OrderRequest, TallyRequest } from '../models/order-request.js';
import { Drink } from '../models/drink.js';
import { InventoryItem } from '../models/inventory.js';
import { Order } from '../models/order.js';
import { User } from '../models/user-auth.js';
import { GenericDAO } from '../models/generic.dao.js';
import { canBeTallied, displayName } from '../utils/members.js';
import { round2, SEPA_DRINK_ID } from '../utils/account.js';
import { withBookingTransaction } from '../utils/transaction.js';
import { bookingTimestamp, checkBookingDate } from './tally-import.js';

// So lange kann man eine selbst gemachte Buchung noch rückgängig machen ("vertippt").
// Danach nur noch der Bierwart.
export const UNDO_WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_DRINK = 30;
const MAX_BACKFILL = 200;

// Akzeptiert das neue Format { userId?, items } und das alte Format [items] (nur eigenes Konto).
function parseTally(body: unknown): TallyRequest | null {
  if (Array.isArray(body)) return { items: body };
  if (body && typeof body === 'object' && Array.isArray((body as TallyRequest).items)) {
    const { userId, items } = body as TallyRequest;
    return { userId: typeof userId === 'string' && userId ? userId : undefined, items };
  }
  return null;
}

// Bestand nur anpassen, wenn das Getränk im Inventar geführt wird. Der Bestand blockiert
// das Stricheln nie – an der Theke wird immer gestrichelt, die Inventur korrigiert der Bierwart.
export async function adjustStock(inventoryDao: GenericDAO<InventoryItem>, drinkId: string, delta: number) {
  const inventory = await inventoryDao.findOne({ drinkId });
  if (!inventory) return;
  await inventoryDao.update({ id: inventory.id, stock: Math.max(0, Number(inventory.stock) + delta) });
}

export function orderRoutes(app: Express) {
  // Striche buchen – für sich selbst oder (mit userId) für einen Bundesbruder bzw. eine Kasse.
  app.post('/api/order', authMiddleware, async (req: AuthRequest, res) => {
    const tally = parseTally(req.body);
    if (!tally || tally.items.length === 0) {
      return res.status(400).json({ error: 'Keine Getränke ausgewählt' });
    }

    const items: OrderRequest[] = tally.items.map(item => ({ id: String(item?.id ?? ''), value: Number(item?.value) }));
    if (items.some(item => !Number.isInteger(item.value) || item.value < 1 || item.value > MAX_PER_DRINK)) {
      return res.status(400).json({ error: `Pro Getränk sind 1 bis ${MAX_PER_DRINK} Striche möglich` });
    }

    const userDao: GenericDAO<User> = req.app.locals.userDao;
    const orderDao: GenericDAO<Order> = req.app.locals.orderDao;
    const drinkDao: GenericDAO<Drink> = req.app.locals.drinkDao;
    const inventoryDao: GenericDAO<InventoryItem> = req.app.locals.inventoryDao;

    try {
      const actor = await userDao.findOne({ id: req.user!.id });
      if (!actor) {
        return res.status(401).json({ error: 'Sitzung ungültig – bitte neu anmelden' });
      }
      if (actor.role === 'theke' && !tally.userId) {
        return res.status(400).json({ error: 'Bitte zuerst auswählen, für wen gestrichelt wird' });
      }

      const target = tally.userId ? await userDao.findOne({ id: tally.userId }) : actor;
      if (!canBeTallied(target)) {
        return res.status(404).json({ error: 'Auf dieses Konto kann nicht gestrichelt werden' });
      }

      const drinksById = new Map((await drinkDao.findAll()).map(drink => [drink.id, drink]));
      const quantities = new Map<string, number>();
      for (const item of items) {
        if (!drinksById.has(item.id)) {
          return res.status(404).json({ error: 'Getränk nicht gefunden – bitte Seite neu laden' });
        }
        quantities.set(item.id, (quantities.get(item.id) ?? 0) + item.value);
      }

      const now = new Date();
      const created: Order[] = [];
      for (const [drinkId, value] of quantities) {
        const drink = drinksById.get(drinkId)!;
        created.push(
          await orderDao.create({
            userId: target.id,
            bookedById: actor.id,
            drinkId,
            name: drink.name,
            unit: drink.unit,
            value,
            price: Number(drink.price),
            date: now
          })
        );
        await adjustStock(inventoryDao, drinkId, -value);
      }

      const total = created.reduce((sum, order) => sum + order.value * order.price, 0);
      return res.status(201).json({
        target: { id: target.id, name: displayName(target) },
        orders: created,
        total: round2(total)
      });
    } catch (error) {
      console.error('Fehler beim Stricheln:', error);
      return res.status(500).json({ error: 'Serverfehler beim Stricheln' });
    }
  });

  // Bierwart: Striche mit Datum nachtragen oder korrigieren (z. B. von der Papierliste).
  // Negative Anzahl = Korrektur, dafür ist eine Begründung Pflicht. Zählt nicht in die Rangliste.
  app.post(
    '/api/order/nachtrag',
    authMiddleware,
    requirePermission(PERMISSIONS.MANAGE_FINANCE),
    async (req: AuthRequest, res) => {
      const { userId, date, note } = req.body ?? {};
      const items: OrderRequest[] = Array.isArray(req.body?.items)
        ? req.body.items.map((item: OrderRequest) => ({ id: String(item?.id ?? ''), value: Number(item?.value) }))
        : [];
      const reason = typeof note === 'string' ? note.trim().slice(0, 200) : '';
      const day = checkBookingDate(date);

      if (items.length === 0 || items.some(item => !Number.isInteger(item.value) || item.value === 0)) {
        return res.status(400).json({ error: 'Bitte mindestens ein Getränk mit Anzahl angeben' });
      }
      if (items.some(item => Math.abs(item.value) > MAX_BACKFILL)) {
        return res.status(400).json({ error: `Pro Getränk höchstens ${MAX_BACKFILL} Striche` });
      }
      if (items.some(item => item.value < 0) && !reason) {
        return res.status(400).json({ error: 'Für eine Korrektur (negative Anzahl) bitte eine Begründung angeben' });
      }
      if (!day) {
        return res.status(400).json({ error: 'Bitte ein gültiges Datum angeben (nicht in der Zukunft)' });
      }

      try {
        const target = await req.app.locals.userDao.findOne({ id: String(userId ?? '') });
        if (!canBeTallied(target)) {
          return res.status(404).json({ error: 'Auf dieses Konto kann nicht gestrichelt werden' });
        }
        const drinksById = new Map(((await req.app.locals.drinkDao.findAll()) as Drink[]).map(d => [d.id, d]));
        if (items.some(item => !drinksById.has(item.id))) {
          return res.status(404).json({ error: 'Getränk nicht gefunden – bitte Seite neu laden' });
        }

        const created = await withBookingTransaction(req.app, async daos => {
          const orders: Order[] = [];
          for (const item of items) {
            const drink = drinksById.get(item.id)!;
            orders.push(
              await daos.orderDao.create({
                userId: target.id,
                bookedById: req.user!.id,
                drinkId: drink.id,
                name: drink.name,
                unit: drink.unit,
                value: item.value,
                price: Number(drink.price),
                date: bookingTimestamp(day),
                source: 'nachtrag',
                importId: null,
                note: reason || null
              })
            );
            await adjustStock(daos.inventoryDao, drink.id, -item.value);
          }
          return orders;
        });

        const total = created.reduce((sum, order) => sum + order.value * order.price, 0);
        res
          .status(201)
          .json({ target: { id: target.id, name: displayName(target) }, orders: created, total: round2(total) });
      } catch (error) {
        console.error('Fehler beim Nachtragen:', error);
        res.status(500).json({ error: 'Serverfehler beim Nachtragen' });
      }
    }
  );

  // Bierwart: die zuletzt nachgetragenen Striche (zum Kontrollieren und ggf. Löschen)
  app.get('/api/order/nachtrag', authMiddleware, requirePermission(PERMISSIONS.MANAGE_FINANCE), async (req, res) => {
    try {
      const [orders, users]: [Order[], User[]] = await Promise.all([
        req.app.locals.orderDao.findAll({ source: 'nachtrag' }),
        req.app.locals.userDao.findAll()
      ]);
      const names = new Map(users.map(user => [user.id, displayName(user)]));
      res.json({
        entries: orders
          .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
          .slice(0, 50)
          .map(order => ({
            id: order.id,
            date: new Date(order.date).toISOString(),
            createdAt: new Date(Number(order.createdAt)).toISOString(),
            target: names.get(order.userId) ?? 'Unbekannt',
            title: `${order.name} ${order.unit}`.trim(),
            quantity: Number(order.value),
            amount: round2(Number(order.value) * Number(order.price)),
            note: order.note ?? '',
            bookedBy: names.get(order.bookedById ?? '') ?? 'Unbekannt'
          }))
      });
    } catch (error) {
      console.error('Fehler beim Laden der Nachträge:', error);
      res.status(500).json({ error: 'Serverfehler' });
    }
  });

  // Eigene Buchungen der letzten Minuten (auch die für andere) – für "Rückgängig".
  app.get('/api/order/recent', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userDao: GenericDAO<User> = req.app.locals.userDao;
      const orderDao: GenericDAO<Order> = req.app.locals.orderDao;
      const since = Date.now() - UNDO_WINDOW_MS;

      // Importe und Nachträge des Bierwarts gehören nicht in "Rückgängig" auf der Strichel-Seite
      const orders = (await orderDao.findAll({ bookedById: req.user!.id })).filter(
        order => Number(order.createdAt) >= since && !order.source
      );
      const names = new Map((await userDao.findAll()).map(user => [user.id, displayName(user)]));

      const recent = orders
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
        .map(order => ({
          id: order.id,
          targetId: order.userId,
          targetName: order.userId === req.user!.id ? 'dich' : (names.get(order.userId) ?? 'Unbekannt'),
          name: order.name,
          unit: order.unit,
          quantity: Number(order.value),
          amount: round2(Number(order.value) * Number(order.price)),
          undoUntil: Number(order.createdAt) + UNDO_WINDOW_MS
        }));

      res.json({ recent });
    } catch (error) {
      console.error('Fehler beim Laden der letzten Buchungen:', error);
      res.status(500).json({ error: 'Serverfehler' });
    }
  });

  // Buchung rückgängig machen: eigene Buchung innerhalb von 10 Minuten, Bierwart jederzeit.
  app.delete('/api/order/:id', authMiddleware, async (req: AuthRequest, res) => {
    const id = String(req.params.id);
    try {
      const orderDao: GenericDAO<Order> = req.app.locals.orderDao;
      const order = await orderDao.findOne({ id });
      if (!order || order.drinkId === SEPA_DRINK_ID) {
        return res.status(404).json({ error: 'Buchung nicht gefunden' });
      }
      if (order.importId) {
        return res.status(409).json({
          error: 'Diese Striche stammen aus einem Strichlisten-Import. Bitte den ganzen Import zurücknehmen.'
        });
      }

      const isOwnRecent = order.bookedById === req.user!.id && Date.now() - Number(order.createdAt) <= UNDO_WINDOW_MS;
      if (!isOwnRecent && !(await roleHasPermission(req.app, req.user!.role, PERMISSIONS.MANAGE_FINANCE))) {
        return res
          .status(403)
          .json({ error: 'Rückgängig geht nur innerhalb von 10 Minuten. Bitte wende dich an den Bierwart.' });
      }

      await orderDao.delete(id);
      await adjustStock(req.app.locals.inventoryDao, order.drinkId, Number(order.value));
      res.status(204).send();
    } catch (error) {
      console.error(`Fehler beim Stornieren der Buchung ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler beim Rückgängigmachen' });
    }
  });
}
