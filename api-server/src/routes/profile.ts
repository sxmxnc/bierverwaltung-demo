/* Autor: Jonas Bergjürgen (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { Express, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { User } from '../models/user-auth.js';

function toSafeUser(user: User): Partial<User> {
  const safe: Partial<User> = { ...user };
  delete safe.password;
  return safe;
}

export function profileRoutes(app: Express) {
  app.get('/api/users/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userDao = req.app.locals.userDao;
      const user: User | null = await userDao.findOne({ id: req.user!.id });
      if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
      res.json(toSafeUser(user));
    } catch {
      res.status(500).json({ error: 'Serverfehler' });
    }
  });

  // Das Theken-Gerät ist ein gemeinsames Konto: Profil und Passwort ändert nur der Bierwart
  const rejectTheke = (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'theke') return false;
    res.status(403).json({ error: 'Das Theken-Konto kann nur der Bierwart ändern' });
    return true;
  };

  app.put('/api/users/me', authMiddleware, async (req: AuthRequest, res) => {
    if (rejectTheke(req, res)) return;
    const { firstName, lastName, nickname, residence, iban, debtorBank } = req.body;
    try {
      const userDao = req.app.locals.userDao;
      const user: User | null = await userDao.findOne({ id: req.user!.id });
      if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
      await userDao.update({
        id: req.user!.id,
        ...(firstName && { firstName: firstName.trim() }),
        ...(lastName && { lastName: lastName.trim() }),
        ...(typeof nickname === 'string' && { nickname: nickname.trim() || null }),
        ...(residence && { residence: residence.trim() }),
        sepaMandate: {
          ...user.sepaMandate,
          ...(iban !== undefined && { iban: iban.trim() }),
          ...(debtorBank !== undefined && { debtorBank: debtorBank.trim() })
        }
      });
      const updated: User | null = await userDao.findOne({ id: req.user!.id });
      res.json(toSafeUser(updated!));
    } catch {
      res.status(500).json({ error: 'Serverfehler beim Aktualisieren' });
    }
  });

  app.patch('/api/users/me/password', authMiddleware, async (req: AuthRequest, res) => {
    if (rejectTheke(req, res)) return;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Aktuelles und neues Passwort sind Pflichtfelder' });
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res
        .status(400)
        .json({ error: 'Passwort muss mindestens 8 Zeichen, einen Großbuchstaben und eine Zahl enthalten' });
    }
    try {
      const userDao = req.app.locals.userDao;
      const user: User | null = await userDao.findOne({ id: req.user!.id });
      if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
      const match = user.password ? await bcrypt.compare(currentPassword, user.password) : false;
      // 400 statt 401: der Client würde bei 401 sonst zur Anmeldung umleiten
      if (!match) return res.status(400).json({ error: 'Aktuelles Passwort ist falsch' });
      const hashed = await bcrypt.hash(newPassword, 10);
      await userDao.update({ id: req.user!.id, password: hashed });
      res.json({ message: 'Passwort erfolgreich geändert' });
    } catch {
      res.status(500).json({ error: 'Serverfehler beim Ändern des Passworts' });
    }
  });
}
