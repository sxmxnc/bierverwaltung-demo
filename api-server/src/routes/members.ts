/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { User } from '../models/user-auth.js';
import { canBeTallied, displayName } from '../utils/members.js';

export function membersRoutes(app: Express) {
  // Alle Konten, auf die gestrichelt werden kann – für die Personenauswahl.
  // Bewusst nur Namen, keine Kontaktdaten oder Salden.
  app.get('/api/members', authMiddleware, async (req, res) => {
    try {
      const users: User[] = await req.app.locals.userDao.findAll();
      const members = users
        .filter(canBeTallied)
        .map(user => {
          const fullName = `${user.firstName} ${user.lastName}`.trim();
          const name = displayName(user);
          return {
            id: user.id,
            name,
            // Zweite Zeile in der Auswahl: bei Kassen der Verantwortliche (z. B. Quaestor),
            // bei Mitgliedern mit V/o der bürgerliche Name
            hint: user.role === 'kasse' ? (user.nickname ?? null) : name !== fullName ? fullName : null,
            kind: user.role === 'kasse' ? 'kasse' : 'member'
          };
        })
        // Kassen zuerst (wie auf der Papier-Strichliste), dann alphabetisch
        .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'de') : a.kind === 'kasse' ? -1 : 1));

      res.json({ members });
    } catch (error) {
      console.error('Fehler beim Laden der Mitgliederliste:', error);
      res.status(500).json({ error: 'Serverfehler beim Laden der Mitglieder' });
    }
  });
}
