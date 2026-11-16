/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/permissions.js';
import { Drink } from '../models/drink.js';
import { InventoryItem } from '../models/inventory.js';
import { Order } from '../models/order.js';
import { Payment } from '../models/payment.js';
import { User } from '../models/user-auth.js';
import { balancesByUser, round2, SEPA_DRINK_ID } from '../utils/account.js';
import { displayName } from '../utils/members.js';
import { parsePeriod, periodRange } from '../utils/periods.js';
import { litersOf } from '../utils/units.js';
import { effectiveThreshold } from '../utils/stock.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function reportRoutes(app: Express) {
  // Bierwart: was hat jeder Bundesbruder (und jede Kasse) im Zeitraum getrunken?
  app.get(
    '/api/reports/consumption',
    authMiddleware,
    requirePermission(PERMISSIONS.MANAGE_FINANCE),
    async (req, res) => {
      try {
        const period = parsePeriod(req.query.period, 'month');
        const { from, to } = periodRange(period);
        const [drinks, orders, payments, users]: [Drink[], Order[], Payment[], User[]] = await Promise.all([
          req.app.locals.drinkDao.findAll(),
          req.app.locals.orderDao.findAll(),
          req.app.locals.paymentDao.findAll(),
          req.app.locals.userDao.findAll()
        ]);
        const beerIds = new Set(drinks.filter(drink => drink.isBeer === true).map(drink => drink.id));
        const balances = balancesByUser(orders, payments);

        type Line = { name: string; unit: string; count: number; amount: number };
        const perUser = new Map<
          string,
          { count: number; amount: number; beerLiters: number; lines: Map<string, Line> }
        >();
        for (const order of orders) {
          if (order.drinkId === SEPA_DRINK_ID) continue;
          const time = new Date(order.date).getTime();
          if (time < from || time >= to) continue;
          const value = Number(order.value);
          const amount = value * Number(order.price);
          const stats = perUser.get(order.userId) ?? { count: 0, amount: 0, beerLiters: 0, lines: new Map() };
          stats.count += value;
          stats.amount += amount;
          if (beerIds.has(order.drinkId)) stats.beerLiters += value * litersOf(order.unit);
          const key = `${order.name}|${order.unit}`;
          const line = stats.lines.get(key) ?? { name: order.name, unit: order.unit, count: 0, amount: 0 };
          line.count += value;
          line.amount += amount;
          stats.lines.set(key, line);
          perUser.set(order.userId, stats);
        }

        const members = users
          .filter(user => user.role !== 'theke' && (user.status === 'active' || perUser.has(user.id)))
          .map(user => {
            const stats = perUser.get(user.id);
            return {
              id: user.id,
              name: displayName(user),
              fullName: `${user.firstName} ${user.lastName}`.trim(),
              kind: user.role === 'kasse' ? 'kasse' : 'member',
              status: user.status,
              balance: round2(balances.get(user.id) ?? 0),
              count: stats?.count ?? 0,
              amount: round2(stats?.amount ?? 0),
              beerLiters: round2(stats?.beerLiters ?? 0),
              drinks: [...(stats?.lines.values() ?? [])]
                .map(line => ({ ...line, amount: round2(line.amount) }))
                .sort((a, b) => b.count - a.count)
            };
          })
          .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'de'));

        res.json({
          period,
          from: Number.isFinite(from) ? new Date(from).toISOString() : null,
          to: Number.isFinite(to) ? new Date(to).toISOString() : null,
          totals: {
            count: members.reduce((sum, member) => sum + member.count, 0),
            amount: round2(members.reduce((sum, member) => sum + member.amount, 0)),
            beerLiters: round2(members.reduce((sum, member) => sum + member.beerLiters, 0))
          },
          members
        });
      } catch (error) {
        console.error('Fehler bei der Verbrauchsübersicht:', error);
        res.status(500).json({ error: 'Serverfehler bei der Verbrauchsübersicht' });
      }
    }
  );

  // Bierwart: Bestand je Getränk plus Verbrauch der letzten 7 und 30 Tage und geschätzte Reichweite
  app.get('/api/reports/inventory', authMiddleware, requirePermission(PERMISSIONS.MANAGE_DRINKS), async (req, res) => {
    try {
      const [drinks, inventory, orders]: [Drink[], InventoryItem[], Order[]] = await Promise.all([
        req.app.locals.drinkDao.findAll(),
        req.app.locals.inventoryDao.findAll(),
        req.app.locals.orderDao.findAll()
      ]);
      const now = Date.now();
      const stockByDrink = new Map(inventory.map(item => [item.drinkId, Number(item.stock)]));

      const sold = new Map<string, { d7: number; d30: number }>();
      for (const order of orders) {
        const age = now - new Date(order.date).getTime();
        if (age > 30 * DAY_MS) continue;
        const entry = sold.get(order.drinkId) ?? { d7: 0, d30: 0 };
        entry.d30 += Number(order.value);
        if (age <= 7 * DAY_MS) entry.d7 += Number(order.value);
        sold.set(order.drinkId, entry);
      }

      const items = drinks
        .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
        .map(drink => {
          const tracked = stockByDrink.has(drink.id);
          const stock = stockByDrink.get(drink.id) ?? 0;
          const threshold = effectiveThreshold(drink);
          const usage = sold.get(drink.id) ?? { d7: 0, d30: 0 };
          const perDay = usage.d30 / 30;
          const liters = litersOf(drink.unit);
          return {
            drinkId: drink.id,
            name: drink.name,
            unit: drink.unit,
            packaging: drink.packaging,
            price: Number(drink.price),
            isBeer: drink.isBeer === true,
            tracked,
            stock,
            threshold,
            status: !tracked ? 'untracked' : stock === 0 ? 'empty' : stock < threshold ? 'low' : 'ok',
            sold7: usage.d7,
            sold30: usage.d30,
            liters7: round2(usage.d7 * liters),
            liters30: round2(usage.d30 * liters),
            daysLeft: tracked && perDay > 0 ? Math.floor(stock / perDay) : null,
            stockValue: round2(stock * Number(drink.price))
          };
        });

      res.json({
        items,
        totals: {
          stockValue: round2(items.reduce((sum, item) => sum + item.stockValue, 0)),
          low: items.filter(item => item.status === 'low').length,
          empty: items.filter(item => item.status === 'empty').length,
          draftLiters30: round2(
            items.filter(item => item.packaging === 'Fass').reduce((sum, item) => sum + item.liters30, 0)
          )
        }
      });
    } catch (error) {
      console.error('Fehler bei der Bestandsübersicht:', error);
      res.status(500).json({ error: 'Serverfehler bei der Bestandsübersicht' });
    }
  });
}
