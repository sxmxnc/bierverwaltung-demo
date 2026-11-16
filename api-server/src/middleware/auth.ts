/* Autor: Jonas Bergjürgen (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user-auth.js';

export interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

// Prüft das Token und lädt den Benutzer bei jeder Anfrage frisch aus der Datenbank.
// Da Sitzungen lange gültig sind (30 Tage, Theke 1 Jahr), greifen Sperren und
// Rollenwechsel so sofort und nicht erst beim Ablauf des Tokens.
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Kein Token vorhanden' });
  }

  let decoded: { id: string };
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
  } catch {
    return res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
  }

  try {
    const user: User | null = await req.app.locals.userDao.findOne({ id: decoded.id });
    if (!user || user.status !== 'active' || user.role === 'kasse') {
      return res.status(401).json({ error: 'Sitzung ungültig – bitte neu anmelden' });
    }
    req.user = { id: user.id, role: user.role };
    next();
  } catch (err) {
    console.error('Fehler bei der Anmeldeprüfung:', err);
    return res.status(500).json({ error: 'Serverfehler' });
  }
}
