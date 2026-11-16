/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user-auth.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Mitglieder bleiben 30 Tage angemeldet (niemand soll sich an der Bar neu einloggen müssen),
// das Theken-Gerät ein Jahr.
function sessionDays(user: User): number {
  return user.role === 'theke' ? 365 : 30;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: (process.env.NODE_ENV === 'development' ? 'lax' : 'strict') as 'lax' | 'strict'
  };
}

export function startSession(res: Response, user: User) {
  const days = sessionDays(user);
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: `${days}d` });
  res.cookie('token', token, { ...cookieOptions(), maxAge: days * DAY_MS });
}

export function endSession(res: Response) {
  res.clearCookie('token', cookieOptions());
}
