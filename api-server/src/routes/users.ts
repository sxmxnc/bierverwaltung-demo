/* Autor: Julius Vollmer (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import bcrypt from 'bcryptjs';
import { hasLogin, User, SafeUser, USER_CATEGORIES, USER_ROLES, USER_STATUSES } from '../models/user-auth.js';
import { Order } from '../models/order.js';
import { Payment } from '../models/payment.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/permissions.js';
import { balancesByUser, CORRECTION_NOTE } from '../utils/account.js';
import { CLUB } from '../club.js';

interface AppLocals {
  userDao: {
    findAll(): Promise<User[]>;
    findOne(f: Partial<User>): Promise<User | null>;
    update(u: Partial<User> & { id: string }): Promise<boolean>;
    create(u: Omit<User, 'id' | 'createdAt'>): Promise<User>;
    delete(id: string): Promise<boolean>;
  };
  orderDao: { findAll(): Promise<Order[]> };
  paymentDao: { findAll(): Promise<Payment[]>; create(p: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> };
}

// Liefert den Benutzer ohne Passwort-Hash und mit dem berechneten Saldo. mit Hilfe CHAT GPT
function toSafeUser(user: User, balance: number): SafeUser {
  const safe: Partial<User> = { ...user };
  delete safe.password;
  delete safe.pendingPassword;
  return { ...(safe as Omit<User, 'password' | 'pendingPassword'>), balance, hasLogin: hasLogin(user) };
}

// Platzhalter für Konten ohne Login (die Spalte email ist Pflicht und eindeutig); .invalid ist nie zustellbar
export function placeholderEmail(): string {
  return `mitglied-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mitglied.invalid`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith('.invalid');
}

// Berechnet die Salden aller Nutzer in einem Durchgang aus orders + payments.
async function loadBalances(locals: AppLocals): Promise<Map<string, number>> {
  const [orders, payments] = await Promise.all([locals.orderDao.findAll(), locals.paymentDao.findAll()]);
  return balancesByUser(orders, payments);
}

// Mit Hilfe Claude
export function usersRoutes(app: Express) {
  app.get('/api/users', authMiddleware, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
    try {
      const locals = req.app.locals as AppLocals;
      const [users, balances] = await Promise.all([locals.userDao.findAll(), loadBalances(locals)]);
      // Passwort-Hash nie zurückgeben
      res.json(users.map(user => toSafeUser(user, balances.get(user.id) ?? 0)));
    } catch (error) {
      console.error('Fehler beim Laden der Benutzer:', error);
      res.status(500).json({ error: 'Serverfehler beim Abrufen der Benutzer' });
    }
  });
  app.get('/api/users/:id', authMiddleware, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
    const id = req.params.id as string;
    try {
      const locals = req.app.locals as AppLocals;
      const user = await locals.userDao.findOne({ id });
      if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
      const balances = await loadBalances(locals);
      res.json(toSafeUser(user, balances.get(user.id) ?? 0));
    } catch (error) {
      console.error(`Fehler beim Laden des Benutzers ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler beim Abrufen des Benutzers' });
    }
  });
  app.patch(
    '/api/users/:id',
    authMiddleware,
    requirePermission(PERMISSIONS.MANAGE_USERS),
    async (req: AuthRequest, res) => {
      const id = req.params.id as string;
      const { role, status, balance, nickname, firstName, lastName, category } = req.body;

      try {
        const locals = req.app.locals as AppLocals;
        const user = await locals.userDao.findOne({ id });
        if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

        if (role && !USER_ROLES.includes(role)) {
          return res.status(400).json({ error: 'Ungültige Kontoart' });
        }
        if (status && !USER_STATUSES.includes(status)) {
          return res.status(400).json({ error: 'Ungültiger Status' });
        }
        if (category !== undefined && category !== null && category !== '' && !USER_CATEGORIES.includes(category)) {
          return res.status(400).json({ error: 'Ungültige Kategorie' });
        }
        if (balance !== undefined && typeof balance !== 'number') {
          return res.status(400).json({ error: 'Der Kontostand muss eine Zahl sein' });
        }
        // Schutz davor, sich als Bierwart versehentlich selbst auszusperren
        if (id === req.user!.id && ((role && role !== user.role) || (status && status !== 'active'))) {
          return res.status(400).json({ error: 'Die eigene Kontoart bzw. den eigenen Status kannst du nicht ändern' });
        }

        const updatedData: Partial<User> & { id: string } = { id };
        if (role) updatedData.role = role;
        if (status) updatedData.status = status;
        if (typeof nickname === 'string') updatedData.nickname = nickname.trim() || null;
        if (typeof firstName === 'string' && firstName.trim()) updatedData.firstName = firstName.trim();
        if (typeof lastName === 'string') updatedData.lastName = lastName.trim();
        if (category !== undefined) updatedData.category = category || null;
        // Nur aktualisieren, wenn es außer der id wirklich Felder gibt
        if (Object.keys(updatedData).length > 1) {
          await locals.userDao.update(updatedData);
        }

        let balances = await loadBalances(locals);
        if (balance !== undefined) {
          const current = balances.get(id) ?? 0;
          const diff = Math.round((balance - current) * 100) / 100;
          if (diff !== 0) {
            await locals.paymentDao.create({
              userId: id,
              amount: diff,
              note: CORRECTION_NOTE,
              date: new Date().toISOString(),
              createdByAdminId: req.user!.id
            });
            balances = await loadBalances(locals);
          }
        }

        const updatedUser = await locals.userDao.findOne({ id });
        res.json(toSafeUser(updatedUser!, balances.get(id) ?? 0));
      } catch (error) {
        console.error(`Fehler beim Aktualisieren des Benutzers ${id}:`, error);
        res.status(500).json({ error: 'Serverfehler beim Aktualisieren des Benutzers' });
      }
    }
  );

  app.patch(
    '/api/users/:id/password',
    authMiddleware,
    requirePermission(PERMISSIONS.MANAGE_USERS),
    async (req, res) => {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' });
      }

      try {
        const userDao = req.app.locals.userDao;
        const user: User | null = await userDao.findOne({ id });
        if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

        const hashedPassword = await bcrypt.hash(password, 10);
        await userDao.update({ id, password: hashedPassword });

        res.json({ message: 'Passwort erfolgreich geändert' });
      } catch (error) {
        console.error(`Fehler beim Ändern des Passworts für Benutzer ${id}:`, error);
        res.status(500).json({ error: 'Serverfehler beim Ändern des Passworts' });
      }
    }
  );

  app.post('/api/users', authMiddleware, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
    const { firstName, lastName, nickname, email, residence, role, status, password, iban, debtorBank, category } =
      req.body;

    if (!firstName || !role) {
      return res.status(400).json({ error: 'Name und Kontoart sind Pflichtfelder' });
    }
    if (!USER_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Ungültige Kontoart' });
    }
    // Kassen (Aktivenkasse, Fuxenkasse, ...) brauchen weder E-Mail noch Passwort – sie melden sich nie an.
    const isKasse = role === 'kasse';
    // Mitglied ohne E-Mail und ohne Passwort = Konto ohne Login (nur an der Theke wählbar)
    const withoutLogin = !isKasse && !email && !password;
    if (!isKasse && !lastName) {
      return res.status(400).json({ error: 'Vorname und Nachname sind Pflichtfelder' });
    }
    if (!isKasse && !email && password) {
      return res.status(400).json({ error: 'Für ein Konto mit Login ist eine E-Mail-Adresse nötig' });
    }
    if (category !== undefined && category !== null && category !== '' && !USER_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Ungültige Kategorie' });
    }
    if (!isKasse && password && (typeof password !== 'string' || password.length < 8)) {
      return res.status(400).json({ error: 'Das Passwort muss mindestens 8 Zeichen lang sein' });
    }

    try {
      const userDao = (req.app.locals as AppLocals).userDao;
      const normalizedEmail = isKasse
        ? `kasse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@kasse.invalid`
        : withoutLogin
          ? placeholderEmail()
          : String(email).trim().toLowerCase();
      const existing = await userDao.findOne({ email: normalizedEmail });
      if (existing) {
        return res.status(409).json({ error: 'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits' });
      }

      const fullName = `${String(firstName).trim()} ${String(lastName ?? '').trim()}`.trim();
      const newUser = await userDao.create({
        firstName: String(firstName).trim(),
        lastName: String(lastName ?? '').trim(),
        nickname: typeof nickname === 'string' && nickname.trim() ? nickname.trim() : null,
        email: normalizedEmail,
        password: !isKasse && password ? await bcrypt.hash(password, 10) : '',
        residence: typeof residence === 'string' ? residence.trim() : '',
        role,
        status: USER_STATUSES.includes(status) ? status : 'active',
        category: USER_CATEGORIES.includes(category) ? category : null,
        // Gläubigerdaten kommen immer vom Server, nie vom Client
        sepaMandate: {
          creditorName: CLUB.creditorName,
          creditorId: CLUB.creditorId,
          debtorName: fullName,
          debtorBank: typeof debtorBank === 'string' ? debtorBank.trim() : '',
          iban: typeof iban === 'string' ? iban.replace(/\s+/g, '').toUpperCase() : ''
        }
      });

      res.status(201).json(toSafeUser(newUser, 0));
    } catch (error) {
      console.error('Fehler beim Erstellen des Benutzers:', error);
      res.status(500).json({ error: 'Serverfehler beim Erstellen des Benutzers' });
    }
  });

  // Login-Wunsch für ein Konto ohne Login freigeben oder ablehnen (siehe routes/register.ts)
  app.post(
    '/api/users/:id/login-request',
    authMiddleware,
    requirePermission(PERMISSIONS.MANAGE_USERS),
    async (req, res) => {
      const id = req.params.id as string;
      try {
        const locals = req.app.locals as AppLocals;
        const user = await locals.userDao.findOne({ id });
        if (!user || !user.pendingPassword) return res.status(404).json({ error: 'Kein offener Login-Wunsch' });
        if (req.body?.approve === true) {
          await locals.userDao.update({
            id,
            password: user.pendingPassword,
            pendingPassword: null,
            loginRequestedAt: null
          });
        } else {
          await locals.userDao.update({ id, pendingPassword: null, loginRequestedAt: null });
        }
        const balances = await loadBalances(locals);
        res.json(toSafeUser((await locals.userDao.findOne({ id }))!, balances.get(id) ?? 0));
      } catch (error) {
        console.error(`Fehler beim Login-Wunsch für ${id}:`, error);
        res.status(500).json({ error: 'Serverfehler' });
      }
    }
  );

  // Neue Registrierung (wartet auf Freischaltung) mit einem bestehenden Konto ohne Login zusammenführen:
  // E-Mail und Passwort wandern auf das bestehende Konto, die Registrierung wird gelöscht.
  app.post('/api/users/:id/merge', authMiddleware, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
    const id = req.params.id as string;
    const targetId = String(req.body?.targetId ?? '');
    try {
      const locals = req.app.locals as AppLocals;
      const [source, target] = await Promise.all([
        locals.userDao.findOne({ id }),
        locals.userDao.findOne({ id: targetId })
      ]);
      if (!source || source.status !== 'pending' || !hasLogin(source)) {
        return res
          .status(400)
          .json({ error: 'Zusammenführen geht nur mit einer Registrierung, die auf Freischaltung wartet' });
      }
      if (!target || target.id === source.id || target.role === 'kasse' || hasLogin(target)) {
        return res.status(400).json({ error: 'Ziel muss ein Mitgliedskonto ohne Login sein' });
      }
      const [orders, payments] = await Promise.all([locals.orderDao.findAll(), locals.paymentDao.findAll()]);
      if (orders.some(o => o.userId === source.id) || payments.some(p => p.userId === source.id)) {
        return res
          .status(409)
          .json({ error: 'Die Registrierung hat schon Buchungen und kann nicht zusammengeführt werden' });
      }
      // Erst die Registrierung löschen (E-Mail ist eindeutig), dann das Zielkonto übernehmen
      await locals.userDao.delete(source.id);
      await locals.userDao.update({
        id: target.id,
        email: source.email,
        password: source.password,
        nickname: target.nickname || source.nickname || null,
        pendingPassword: null,
        loginRequestedAt: null
      });
      const balances = await loadBalances(locals);
      res.json(toSafeUser((await locals.userDao.findOne({ id: target.id }))!, balances.get(target.id) ?? 0));
    } catch (error) {
      console.error(`Fehler beim Zusammenführen von ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler beim Zusammenführen' });
    }
  });
}
