/* Autor: Marius Middrup (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/permissions.js';
import { Payment } from '../models/payment.js';
import { User } from '../models/user-auth.js';

// Zahlungsarten der Bierkasse (die SEPA-Lastschrift liegt auf dem Branch feature/sepa-lastschrift).
const PAYMENT_METHODS = { ueberweisung: 'Überweisung', bar: 'Bar' } as const;

function paymentNote(method: keyof typeof PAYMENT_METHODS | undefined, note: unknown): string {
  const extra = typeof note === 'string' ? note.trim() : '';
  if (!method) return extra;
  const base = `Einzahlung (${PAYMENT_METHODS[method]})`;
  return extra ? `${base} – ${extra}` : base;
}

export function paymentsRoutes(app: Express) {
  // Admin: Einzahlung für einen User buchen
  app.post(
    '/api/payments',
    authMiddleware,
    requirePermission(PERMISSIONS.MANAGE_FINANCE),
    async (req: AuthRequest, res) => {
      const paymentDao = req.app.locals.paymentDao;
      const userDao = req.app.locals.userDao;

      const { userId, amount, note, method } = req.body;
      if (!userId || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ error: 'userId und positiver amount erforderlich' });
      }
      if (method !== undefined && !Object.keys(PAYMENT_METHODS).includes(method)) {
        return res.status(400).json({ error: 'Ungültige Zahlungsart' });
      }

      const user: User = await userDao.findOne({ id: userId });
      if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

      // Der Saldo wird ausschließlich aus orders + payments berechnet (siehe utils/account.ts).
      // Die Einzahlung als Payment zu buchen genügt – kein separates balance-Feld fortschreiben.
      const payment: Payment = await paymentDao.create({
        userId,
        amount: Number(amount),
        note: paymentNote(method, note),
        date: new Date().toISOString(),
        createdByAdminId: req.user!.id
      });

      res.status(201).json(payment);
    }
  );

  // Eigene Einzahlungen abrufen
  app.get('/api/payments/me', authMiddleware, async (req: AuthRequest, res) => {
    const paymentDao = req.app.locals.paymentDao;
    const all: Payment[] = await paymentDao.findAll();
    const mine = all.filter(p => p.userId === req.user!.id);
    res.json({ payments: mine.map(p => ({ ...p, amount: Number(p.amount) })) });
  });

  // Admin: alle Einzahlungen abrufen
  app.get(
    '/api/payments',
    authMiddleware,
    requirePermission(PERMISSIONS.MANAGE_FINANCE),
    async (req: AuthRequest, res) => {
      const paymentDao = req.app.locals.paymentDao;
      const userDao = req.app.locals.userDao;
      const all: Payment[] = await paymentDao.findAll();

      const enriched = await Promise.all(
        all.map(async p => {
          const user: User = await userDao.findOne({ id: p.userId });
          return {
            ...p,
            userName: user ? `${user.firstName} ${user.lastName}` : 'Unbekannt'
          };
        })
      );

      res.json({ payments: enriched });
    }
  );
}
