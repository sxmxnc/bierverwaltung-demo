/* Autor: Julius Vollmer (FH Münster) */

import { Application, Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { Role } from '../models/role.js';

export const PERMISSIONS = {
  MANAGE_USERS: 'manage_users',
  MANAGE_ROLES: 'manage_roles',
  MANAGE_DRINKS: 'manage_drinks',
  MANAGE_FINANCE: 'manage_finance',
  VIEW_STATISTICS: 'view_statistics'
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Anzeigenamen für die Rollen-Verwaltung im Frontend
export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_users: 'Benutzerverwaltung',
  manage_roles: 'Rollenverwaltung',
  manage_drinks: 'Getränkeverwaltung',
  manage_finance: 'Finanzen',
  view_statistics: 'Statistiken'
};

/**
 * Middleware-Fabrik: schützt eine Route mit einer konkreten Berechtigung.
 * Setzt voraus, dass authMiddleware vorher gelaufen ist und req.user gesetzt hat.
 * Die Rolle wird bei jeder Anfrage frisch aus der Datenbank gelesen, damit eine
 * Änderung an den Rechten sofort greift (kein veralteter Stand im Token).
 * Claude AI
 */
export function requirePermission(permission: Permission) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) {
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }

    try {
      const roleDao = req.app.locals.roleDao;
      const roleEntry: Role | null = await roleDao.findOne({ name: role });

      if (!roleEntry || !roleEntry.permissions.includes(permission)) {
        return res.status(403).json({ error: 'Fehlende Berechtigung' });
      }

      next();
    } catch (error) {
      console.error('Fehler bei der Berechtigungsprüfung:', error);
      return res.status(500).json({ error: 'Serverfehler bei der Berechtigungsprüfung' });
    }
  };
}

// Für Prüfungen innerhalb einer Route (z. B. "eigene Buchung ODER Finanzrecht").
export async function roleHasPermission(app: Application, role: string, permission: Permission): Promise<boolean> {
  const roleEntry: Role | null = await app.locals.roleDao.findOne({ name: role });
  return !!roleEntry && roleEntry.permissions.includes(permission);
}
