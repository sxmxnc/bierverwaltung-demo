/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { User, UserRole } from '../models/user-auth.js';

// Auf diese Kontoarten darf gestrichelt werden (nicht auf das Theken-Gerät).
export const TALLY_TARGET_ROLES: UserRole[] = ['admin', 'user', 'kasse'];

// Anzeigename wie auf der Strichliste: V/o (Biername), sonst Vor- und Nachname.
export function displayName(user: Pick<User, 'firstName' | 'lastName' | 'nickname' | 'role'>): string {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  if (user.role === 'kasse') return fullName;
  return user.nickname?.trim() || fullName;
}

export function canBeTallied(user: User | null): user is User {
  return !!user && user.status === 'active' && TALLY_TARGET_ROLES.includes(user.role);
}
