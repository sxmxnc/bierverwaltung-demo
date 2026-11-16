/* Autor: Julius Vollmer (FH Münster) */

import { Express } from 'express';
import { Role } from '../models/role.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/permissions.js';

export function rolesRoutes(app: Express) {
  // Rollenverwaltung
  app.use('/api/roles', authMiddleware, requirePermission(PERMISSIONS.MANAGE_ROLES));

  // GET alle Rollen
  app.get('/api/roles', async (req, res) => {
    try {
      const roleDao = req.app.locals.roleDao;
      const roles: Role[] = await roleDao.findAll();
      res.json(roles);
    } catch (error) {
      console.error('Fehler beim Laden der Rollen:', error);
      res.status(500).json({ error: 'Serverfehler beim Abrufen der Rollen' });
    }
  });

  // GET einzelne Rolle
  app.get('/api/roles/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const roleDao = req.app.locals.roleDao;
      const role: Role | null = await roleDao.findOne({ id });
      if (!role) {
        return res.status(404).json({ error: 'Rolle nicht gefunden' });
      }
      res.json(role);
    } catch (error) {
      console.error(`Fehler beim Laden der Rolle ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler beim Abrufen der Rolle' });
    }
  });
}
