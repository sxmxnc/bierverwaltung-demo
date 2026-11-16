/* Autor: Jonas Bergjürgen (FH Münster), angepasst für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import bcrypt from 'bcryptjs';
import { GenericDAO } from '../models/generic.dao.js';
import { User } from '../models/user-auth.js';

export function resetPasswordRoutes(app: Express) {
  // Früher (Uni-Demo) wurde der Reset-Token direkt in der Antwort zurückgegeben – damit hätte jeder,
  // der eine E-Mail-Adresse kennt, das Passwort zurücksetzen können. Solange die App keine E-Mails
  // verschickt, setzt der Bierwart vergessene Passwörter in der Mitgliederverwaltung neu.
  app.post('/api/auth/forgot-password', (_req, res) => {
    res.json({ message: 'Bitte wende dich an den Bierwart – er setzt dir ein neues Passwort.' });
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token und neues Passwort sind erforderlich.' });
      return;
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      res
        .status(400)
        .json({ error: 'Passwort muss mindestens 8 Zeichen, einen Großbuchstaben und eine Zahl enthalten.' });
      return;
    }

    const userDao: GenericDAO<User> = req.app.locals.userDao;
    const user = await userDao.findOne({ resetToken: token });

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < Date.now()) {
      res.status(400).json({ error: 'Token ungültig oder abgelaufen.' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await userDao.update({ id: user.id, password: hashed, resetToken: undefined, resetTokenExpiry: undefined });

    res.json({ message: 'Passwort erfolgreich zurückgesetzt.' });
  });
}
