/* Autor: Jonas Bergjürgen (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/user-auth.js';
import { CLUB } from '../club.js';

export function registerRoutes(app: Express) {
  // Neue Konten starten im Status "pending": Erst nach Freischaltung durch den Bierwart
  // kann man sich anmelden. Sonst könnte jeder Fremde auf die Konten der Bundesbrüder stricheln.
  app.post('/api/users/register', async (req, res) => {
    const { firstName, lastName, nickname, email, password, residence } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Vorname, Nachname, E-Mail und Passwort sind Pflichtfelder' });
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res
        .status(400)
        .json({ error: 'Passwort muss mindestens 8 Zeichen, einen Großbuchstaben und eine Zahl enthalten' });
    }

    try {
      const userDao = req.app.locals.userDao;

      const existing: User | null = await userDao.findOne({ email: email.trim().toLowerCase() });
      const hashedPassword = await bcrypt.hash(password, 10);
      // Konto ohne Login (z. B. aus der Excel übernommen) mit dieser E-Mail: Login-Wunsch merken, der Bierwart
      // gibt ihn frei. Das Konto bleibt bis dahin an der Theke nutzbar.
      if (existing && !existing.password && existing.role !== 'kasse') {
        await userDao.update({ id: existing.id, pendingPassword: hashedPassword, loginRequestedAt: Date.now() });
        return res.status(201).json({ id: existing.id, status: 'pending' });
      }
      if (existing) {
        return res.status(409).json({ error: 'Ein Benutzer mit dieser E-Mail existiert bereits' });
      }

      const newUser: User = await userDao.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: typeof nickname === 'string' && nickname.trim() ? nickname.trim() : null,
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        residence: typeof residence === 'string' ? residence.trim() : '',
        role: 'user',
        status: 'pending',
        sepaMandate: {
          creditorName: CLUB.creditorName,
          creditorId: CLUB.creditorId,
          debtorName: `${firstName.trim()} ${lastName.trim()}`,
          debtorBank: '',
          iban: ''
        }
      });

      res.status(201).json({ id: newUser.id, status: newUser.status });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Serverfehler' });
    }
  });
}
