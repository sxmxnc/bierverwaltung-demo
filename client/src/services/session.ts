/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { User } from '../models/user.js';

export type Me = Omit<User, 'balance'>;

let current: Promise<Me | null> | null = null;

// Angemeldeter Benutzer – einmal geladen und dann von allen Komponenten geteilt.
export function getMe(reload = false): Promise<Me | null> {
  if (!current || reload) {
    current = fetch('/api/users/me', { credentials: 'include' })
      .then(res => (res.ok ? (res.json() as Promise<Me>) : null))
      .catch(() => null);
  }
  return current;
}

export async function logout(): Promise<void> {
  await fetch('/api/users/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
  current = null;
  window.location.href = '/login';
}
