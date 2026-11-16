/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { Drink } from '../models/drink.js';
import { countsForScoreboard, Order } from '../models/order.js';
import { User } from '../models/user-auth.js';
import { displayName } from '../utils/members.js';
import { parsePeriod, periodRange } from '../utils/periods.js';
import { litersOf } from '../utils/units.js';
import { round2 } from '../utils/account.js';

interface ScoreEntry {
  rank: number;
  id: string;
  name: string;
  liters: number;
  count: number;
}

const TOP = 25;

// Rangliste: wer hat im Zeitraum am meisten Bier getrunken (in Litern; nur Getränke mit isBeer).
// Kassen und das Theken-Gerät zählen nicht mit, nur Personen. Importierte Backup-Strichlisten
// und Nachträge des Bierwarts zählen ebenfalls nicht (models/order.ts).
export function scoreboardRoutes(app: Express) {
  app.get('/api/scoreboard', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const period = parsePeriod(req.query.period, 'month');
      const { from, to } = periodRange(period);
      const [drinks, orders, users]: [Drink[], Order[], User[]] = await Promise.all([
        req.app.locals.drinkDao.findAll(),
        req.app.locals.orderDao.findAll(),
        req.app.locals.userDao.findAll()
      ]);

      const beerIds = new Set(drinks.filter(drink => drink.isBeer === true).map(drink => drink.id));
      const people = new Map(
        users
          .filter(user => user.status === 'active' && (user.role === 'user' || user.role === 'admin'))
          .map(user => [user.id, user])
      );

      const totals = new Map<string, { liters: number; count: number }>();
      for (const order of orders) {
        if (!beerIds.has(order.drinkId) || !people.has(order.userId) || !countsForScoreboard(order)) continue;
        const time = new Date(order.date).getTime();
        if (time < from || time >= to) continue;
        const value = Number(order.value);
        const entry = totals.get(order.userId) ?? { liters: 0, count: 0 };
        entry.liters += value * litersOf(order.unit);
        entry.count += value;
        totals.set(order.userId, entry);
      }

      const sorted = [...totals.entries()]
        .map(([id, total]) => ({
          id,
          name: displayName(people.get(id)!),
          liters: round2(total.liters),
          count: total.count
        }))
        .sort((a, b) => b.liters - a.liters || b.count - a.count || a.name.localeCompare(b.name, 'de'));

      // Gleicher Wert = gleicher Platz
      const ranked: ScoreEntry[] = [];
      sorted.forEach((entry, index) => {
        const previous = ranked[index - 1];
        const rank = previous && previous.liters === entry.liters ? previous.rank : index + 1;
        ranked.push({ rank, ...entry });
      });

      const me = ranked.find(entry => entry.id === req.user!.id) ?? null;
      res.json({
        period,
        from: Number.isFinite(from) ? new Date(from).toISOString() : null,
        totalLiters: round2(ranked.reduce((sum, entry) => sum + entry.liters, 0)),
        entries: ranked.slice(0, TOP),
        me
      });
    } catch (error) {
      console.error('Fehler beim Berechnen der Rangliste:', error);
      res.status(500).json({ error: 'Serverfehler beim Berechnen der Rangliste' });
    }
  });
}
