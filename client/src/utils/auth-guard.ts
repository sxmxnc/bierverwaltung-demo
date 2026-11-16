/* Autor: Marius Middrup (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { getMe } from '../services/session.js';

export async function requireAuth(): Promise<boolean> {
  const me = await getMe();
  if (!me) {
    window.location.href = '/login';
    return false;
  }
  return true;
}

export async function requireAdmin(): Promise<boolean> {
  const me = await getMe();
  if (!me) {
    window.location.href = '/login';
    return false;
  }
  if (me.role !== 'admin') {
    window.location.href = '/';
    return false;
  }
  return true;
}
