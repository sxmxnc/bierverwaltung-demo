/* Autor: Julius Vollmer (FH Münster) */

import { Express } from 'express';
import { StockAlert } from '../models/stock-alert.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/permissions.js';

export function stockAlertsRoutes(app: Express) {
  // GET alle Meldungen, optional nach Status gefiltert (?status=open) – nur eingeloggt
  app.get('/api/stock-alerts', authMiddleware, async (req, res) => {
    try {
      const stockAlertDao = req.app.locals.stockAlertDao;
      const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
      const filter = statusParam === 'open' || statusParam === 'resolved' ? { status: statusParam } : undefined;
      const alerts: StockAlert[] = await stockAlertDao.findAll(filter);
      res.json(alerts);
    } catch (error) {
      console.error('Fehler beim Laden der Meldungen:', error);
      res.status(500).json({ error: 'Serverfehler beim Abrufen der Meldungen' });
    }
  });

  // POST neue Meldung – wird von einem eingeloggten Mitglied im Getränke-Inventar ausgelöst
  app.post('/api/stock-alerts', authMiddleware, async (req, res) => {
    const { drinkId, drinkName, reportedByName, message } = req.body;

    if (!drinkId || !drinkName) {
      return res.status(400).json({ error: 'drinkId und drinkName sind Pflichtfelder' });
    }

    try {
      const stockAlertDao = req.app.locals.stockAlertDao;

      // Doppelte offene Meldung für dasselbe Getränk vermeiden
      const existing: StockAlert | null = await stockAlertDao.findOne({ drinkId, status: 'open' });
      if (existing) {
        return res.status(409).json({ error: 'Für dieses Getränk existiert bereits eine offene Meldung' });
      }

      const hasName = typeof reportedByName === 'string' && reportedByName.trim().length > 0;
      const hasMessage = typeof message === 'string' && message.trim().length > 0;

      const alert = await stockAlertDao.create({
        drinkId,
        drinkName,
        reportedByName: hasName ? reportedByName.trim() : 'Ein Mitglied',
        message: hasMessage ? message.trim() : 'Dieses Getränk wird knapp.',
        status: 'open'
      });

      res.status(201).json(alert);
    } catch (error) {
      console.error('Fehler beim Erstellen der Meldung:', error);
      res.status(500).json({ error: 'Serverfehler beim Erstellen der Meldung' });
    }
  });

  // PATCH Meldung als erledigt markieren – nur mit Getränke-Verwaltungsrecht
  app.patch('/api/stock-alerts/:id', authMiddleware, requirePermission(PERMISSIONS.MANAGE_DRINKS), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (status !== 'open' && status !== 'resolved') {
      return res.status(400).json({ error: 'Ungültiger Status' });
    }

    try {
      const stockAlertDao = req.app.locals.stockAlertDao;
      const alert: StockAlert | null = await stockAlertDao.findOne({ id });
      if (!alert) {
        return res.status(404).json({ error: 'Meldung nicht gefunden' });
      }

      await stockAlertDao.update({ id, status });
      const updated = await stockAlertDao.findOne({ id });
      res.json(updated);
    } catch (error) {
      console.error(`Fehler beim Aktualisieren der Meldung ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler beim Aktualisieren der Meldung' });
    }
  });
}
