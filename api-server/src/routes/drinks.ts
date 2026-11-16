/* Autor: Julius Vollmer (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import { DrinkGroup } from '../models/drinks.js';
import { Group } from '../models/group.js';
import { Drink } from '../models/drink.js';
import { InventoryItem } from '../models/inventory.js';
import { StockEntry } from '../models/stock-entry.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/permissions.js';
import { effectiveThreshold } from '../utils/stock.js';

// Mit Hilfe von Claude AI
export function drinksRoutes(app: Express) {
  app.get('/api/drinks', authMiddleware, async (req, res) => {
    const drinkDao = req.app.locals.drinkDao;
    const groupDao = req.app.locals.groupDao;
    const inventoryDao = req.app.locals.inventoryDao;

    const drinks: Drink[] = await drinkDao.findAll();
    const groups: Group[] = await groupDao.findAll();
    const inventoryItems: InventoryItem[] = await inventoryDao.findAll();

    // Feste Reihenfolge wie auf der Strichliste (sortOrder), bei Gleichstand alphabetisch
    const bySortOrder = (a: { sortOrder?: number; name: string }, b: { sortOrder?: number; name: string }) =>
      Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'de');

    const result: DrinkGroup[] = groups
      .map(group => ({ ...group, name: group.group }))
      .sort(bySortOrder)
      .map((group: Group) => ({
        id: group.id,
        group: group.group,
        emoji: group.emoji,
        sortOrder: Number(group.sortOrder ?? 0),
        items: drinks
          .filter((drink: Drink) => drink.groupId === group.id)
          .sort(bySortOrder)
          .map((drink: Drink) => {
            const inventory = inventoryItems.find(i => i.drinkId === drink.id);
            return {
              id: drink.id,
              name: drink.name,
              packaging: drink.packaging,
              unit: drink.unit,
              price: Number(drink.price),
              stock: inventory ? Number(inventory.stock) : 0,
              groupId: drink.groupId,
              lowStockThreshold: effectiveThreshold(drink),
              sortOrder: Number(drink.sortOrder ?? 0),
              isBeer: drink.isBeer === true
            };
          })
      }));

    res.json({ drinks: result });
  });

  // Getränke anlegen/bearbeiten/löschen nur für Admins
  app.post(
    '/api/drinks',
    authMiddleware,
    requirePermission(PERMISSIONS.MANAGE_DRINKS),
    async (req: AuthRequest, res) => {
      const drinkDao = req.app.locals.drinkDao;
      const stockEntryDao = req.app.locals.stockEntryDao;
      const inventoryDao = req.app.locals.inventoryDao;
      const newDrinkData = req.body;

      try {
        // Prüfen, ob das Getränk bereits existiert (Name + Verpackung + Volumen)
        let drink = await drinkDao.findOne({
          name: newDrinkData.name,
          packaging: newDrinkData.packaging,
          unit: newDrinkData.unit
        });

        if (!drink) {
          // Neue Getränke landen am Ende ihrer Gruppe
          const allDrinks: Drink[] = await drinkDao.findAll();
          const maxSortOrder = Math.max(0, ...allDrinks.map(d => Number(d.sortOrder ?? 0)));
          drink = await drinkDao.create({
            sortOrder: maxSortOrder + 1,
            isBeer: newDrinkData.isBeer === true,
            name: newDrinkData.name,
            price: newDrinkData.price,
            packaging: newDrinkData.packaging,
            unit: newDrinkData.unit,
            groupId: newDrinkData.groupId,
            ...(newDrinkData.lowStockThreshold != null && newDrinkData.lowStockThreshold !== ''
              ? { lowStockThreshold: Number(newDrinkData.lowStockThreshold) }
              : {})
          });
        }

        const quantityAdded = parseInt(newDrinkData.quantityAdded) || 0;

        if (quantityAdded > 0) {
          // 1. Restock loggen
          await stockEntryDao.create({
            drinkId: drink!.id,
            drinkName: drink!.name,
            userId: req.user!.id,
            batchId: newDrinkData.batchId || `single-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            quantityAdded: quantityAdded,
            price: Number(newDrinkData.purchasePrice) || 0,
            timestamp: Date.now()
          });

          // 2. Inventar aktualisieren
          const inventory = await inventoryDao.findOne({ drinkId: drink!.id });
          if (inventory) {
            inventory.stock += quantityAdded;
            await inventoryDao.update(inventory);
          } else {
            await inventoryDao.create({
              drinkId: drink!.id,
              stock: quantityAdded
            });
          }
        }

        res.status(201).json(drink);
      } catch (error) {
        console.error('Fehler beim Hinzufügen/Nachkaufen:', error);
        res.status(400).json({ error: 'Failed to process restock' });
      }
    }
  );

  // PATCH /api/drinks/:id – Getränk bearbeiten (Name, Preis, Einheit, Verpackung, Gruppe)
  app.patch('/api/drinks/:id', authMiddleware, requirePermission(PERMISSIONS.MANAGE_DRINKS), async (req, res) => {
    const id = req.params.id as string;
    const { name, price, unit, packaging, groupId, lowStockThreshold, isBeer } = req.body;

    if (packaging !== undefined && !['Flasche', 'Fass'].includes(packaging)) {
      return res.status(400).json({ error: 'Ungültige Verpackungsart' });
    }
    if (price !== undefined && (typeof price !== 'number' || price < 0)) {
      return res.status(400).json({ error: 'Preis muss eine nicht-negative Zahl sein' });
    }
    if (
      lowStockThreshold !== undefined &&
      (typeof lowStockThreshold !== 'number' || lowStockThreshold < 0 || !Number.isInteger(lowStockThreshold))
    ) {
      return res.status(400).json({ error: 'Schwellwert muss eine ganze nicht-negative Zahl sein' });
    }

    try {
      const drinkDao = req.app.locals.drinkDao;
      const drink: Drink | null = await drinkDao.findOne({ id });
      if (!drink) return res.status(404).json({ error: 'Getränk nicht gefunden' });

      const updates: Partial<Drink> & { id: string } = { id };
      if (name !== undefined) updates.name = String(name).trim();
      if (price !== undefined) updates.price = price;
      if (unit !== undefined) updates.unit = String(unit).trim();
      if (packaging !== undefined) updates.packaging = packaging;
      if (groupId !== undefined) updates.groupId = groupId;
      if (lowStockThreshold !== undefined) updates.lowStockThreshold = lowStockThreshold;
      if (typeof isBeer === 'boolean') updates.isBeer = isBeer;

      await drinkDao.update(updates);
      const updated = await drinkDao.findOne({ id });
      res.json(updated);
    } catch (error) {
      console.error(`Fehler beim Bearbeiten von Getränk ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler beim Bearbeiten des Getränks' });
    }
  });

  // DELETE /api/drinks/:id – Getränk und zugehörigen Inventareintrag löschen
  app.delete('/api/drinks/:id', authMiddleware, requirePermission(PERMISSIONS.MANAGE_DRINKS), async (req, res) => {
    const { id } = req.params;
    try {
      const drinkDao = req.app.locals.drinkDao;
      const inventoryDao = req.app.locals.inventoryDao;
      const stockEntryDao = req.app.locals.stockEntryDao;

      const drink: Drink | null = await drinkDao.findOne({ id });
      if (!drink) return res.status(404).json({ error: 'Getränk nicht gefunden' });

      // Abhängige Datensätze (Fremdschlüssel) zuerst entfernen, dann das Getränk selbst.
      // Bestellungen (orders) bleiben erhalten – sie behalten den gespeicherten Namen für die Historie.
      const inventory: InventoryItem | null = await inventoryDao.findOne({ drinkId: id });
      if (inventory) await inventoryDao.delete(inventory.id);

      const stockEntries: StockEntry[] = await stockEntryDao.findAll();
      for (const entry of stockEntries.filter(e => e.drinkId === id)) {
        await stockEntryDao.delete(entry.id);
      }

      await drinkDao.delete(id);

      res.status(204).send();
    } catch (error) {
      console.error(`Fehler beim Löschen von Getränk ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler beim Löschen des Getränks' });
    }
  });

  // PATCH /api/drinks/:id/stock – Bestand manuell auf absoluten Wert setzen
  app.patch('/api/drinks/:id/stock', authMiddleware, requirePermission(PERMISSIONS.MANAGE_DRINKS), async (req, res) => {
    const { id } = req.params;
    const { stock } = req.body;

    if (typeof stock !== 'number' || stock < 0 || !Number.isInteger(stock)) {
      return res.status(400).json({ error: 'Bestand muss eine ganze nicht-negative Zahl sein' });
    }

    try {
      const drinkDao = req.app.locals.drinkDao;
      const inventoryDao = req.app.locals.inventoryDao;

      const drink: Drink | null = await drinkDao.findOne({ id });
      if (!drink) return res.status(404).json({ error: 'Getränk nicht gefunden' });

      const inventory: InventoryItem | null = await inventoryDao.findOne({ drinkId: id });
      if (inventory) {
        inventory.stock = stock;
        await inventoryDao.update(inventory);
      } else {
        await inventoryDao.create({ drinkId: id, stock });
      }

      res.json({ drinkId: id, stock });
    } catch (error) {
      console.error(`Fehler beim Setzen des Bestands für Getränk ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler beim Aktualisieren des Bestands' });
    }
  });
}
