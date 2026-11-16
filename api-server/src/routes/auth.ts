/* Autor: Jonas Bergjürgen (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/user-auth.js';
import { startSession, endSession } from '../utils/session.js';

export function authRoutes(app: Express) {
  app.post('/api/users/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
    }

    try {
      const userDao = req.app.locals.userDao;
      const user: User | null = await userDao.findOne({ email: String(email).trim().toLowerCase() });

      // Konto ohne Login mit offenem Login-Wunsch: richtiges Passwort, aber noch nicht freigegeben
      if (user && !user.password && user.pendingPassword && (await bcrypt.compare(password, user.pendingPassword))) {
        return res.status(403).json({ error: 'Dein Konto muss noch vom Bierwart freigeschaltet werden.' });
      }
      // Kassen-Konten (Aktivenkasse, Fuxenkasse) haben kein Passwort und können sich nicht anmelden
      if (!user || !user.password || user.role === 'kasse') {
        return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
      }

      if (user.status === 'pending') {
        return res.status(403).json({ error: 'Dein Konto muss noch vom Bierwart freigeschaltet werden.' });
      }
      if (user.status !== 'active') {
        return res.status(403).json({ error: 'Dieses Konto ist gesperrt. Bitte wende dich an den Bierwart.' });
      }

      startSession(res, user);
      res.json({ role: user.role });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Serverfehler' });
    }
  });

  app.post('/api/users/logout', (req, res) => {
    endSession(res);
    res.json({ message: 'Abgemeldet' });
  });
}
