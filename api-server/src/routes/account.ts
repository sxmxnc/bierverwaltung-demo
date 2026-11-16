/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia (ersetzt routes/transactions.ts) */

import { Express } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { Order } from '../models/order.js';
import { Payment } from '../models/payment.js';
import { User } from '../models/user-auth.js';
import { computeBalance, CORRECTION_NOTE, round2, SEPA_DRINK_ID } from '../utils/account.js';
import { displayName } from '../utils/members.js';
import { UNDO_WINDOW_MS } from './order.js';

type EntryKind = 'order' | 'sepa' | 'deposit' | 'correction';

interface AccountEntry {
  id: string;
  kind: EntryKind;
  date: string;
  title: string;
  quantity?: number;
  amount: number; // aus Sicht des Kontos: Striche negativ, Einzahlungen positiv
  bookedBy?: string; // nur gesetzt, wenn jemand anderes gestrichelt hat
  canUndo?: boolean;
  origin?: string; // z. B. "Backup-Strichliste (Liste 8)" oder "nachgetragen vom Bierwart"
}

function orderOrigin(order: Order): string | undefined {
  if (order.source === 'strichliste') return order.note ? `Backup-Strichliste (${order.note})` : 'Backup-Strichliste';
  if (order.source === 'nachtrag') return order.note ? `nachgetragen: ${order.note}` : 'nachgetragen vom Bierwart';
  return undefined;
}

const MAX_ENTRIES = 300;

export function accountRoutes(app: Express) {
  // Eigener Saldo plus Verlauf (Striche, Einzahlungen, Lastschriften), neueste zuerst.
  app.get('/api/account', authMiddleware, async (req: AuthRequest, res) => {
    const me = req.user!.id;
    try {
      const [orders, payments, users]: [Order[], Payment[], User[]] = await Promise.all([
        req.app.locals.orderDao.findAll({ userId: me }),
        req.app.locals.paymentDao.findAll({ userId: me }),
        req.app.locals.userDao.findAll()
      ]);
      const names = new Map(users.map(user => [user.id, displayName(user)]));
      const now = Date.now();

      const orderEntries: AccountEntry[] = orders.map(order => {
        const isSepa = order.drinkId === SEPA_DRINK_ID;
        const quantity = Number(order.value);
        const bookedById = order.bookedById ?? null;
        return {
          id: order.id,
          kind: isSepa ? 'sepa' : 'order',
          date: new Date(order.date).toISOString(),
          title: isSepa ? 'SEPA-Lastschrift' : `${order.name} ${order.unit}`.trim(),
          quantity: isSepa ? undefined : quantity,
          amount: round2(-quantity * Number(order.price)),
          bookedBy: bookedById && bookedById !== me ? (names.get(bookedById) ?? 'Unbekannt') : undefined,
          canUndo: !isSepa && !order.source && bookedById === me && now - Number(order.createdAt) <= UNDO_WINDOW_MS,
          origin: orderOrigin(order)
        };
      });

      const paymentEntries: AccountEntry[] = payments.map(payment => ({
        id: payment.id,
        kind: payment.note === CORRECTION_NOTE ? 'correction' : 'deposit',
        date: new Date(payment.date).toISOString(),
        title:
          payment.kind === 'uebertrag'
            ? 'Übertrag aus der bisherigen Strichliste'
            : payment.note === CORRECTION_NOTE
              ? 'Korrektur durch den Bierwart'
              : payment.note || 'Einzahlung',
        origin: payment.kind === 'uebertrag' ? (payment.source ?? undefined) : undefined,
        amount: round2(Number(payment.amount))
      }));

      const entries = [...orderEntries, ...paymentEntries].sort((a, b) => b.date.localeCompare(a.date));

      res.json({ balance: round2(computeBalance(orders, payments)), entries: entries.slice(0, MAX_ENTRIES) });
    } catch (error) {
      console.error('Fehler beim Laden des Kontos:', error);
      res.status(500).json({ error: 'Serverfehler beim Laden des Kontos' });
    }
  });
}
