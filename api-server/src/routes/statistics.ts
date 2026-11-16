/* Autor: Julius Vollmer (FH Münster) */

import { Express } from 'express';
import { User } from '../models/user-auth.js';
import { Drink } from '../models/drink.js';
import { InventoryItem } from '../models/inventory.js';
import { StockEntry } from '../models/stock-entry.js';
import { Order } from '../models/order.js';
import { Payment } from '../models/payment.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/permissions.js';
import { balancesByUser, onlyDrinkOrders } from '../utils/account.js';
import { effectiveThreshold } from '../utils/stock.js';

// Zeitfenster für die am meisten getrunken Auswertung der letzten 30 Tage
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface LowStockDrink {
  drinkId: string;
  name: string;
  packaging: Drink['packaging'];
  unit: string;
  stock: number;
  threshold: number;
  price: number;
}

interface Debtor {
  name: string;
  balance: number;
}

interface TopDrink {
  name: string;
  unit: string;
  count: number;
  totalValue: number;
}

interface PurchaseItem {
  drinkName: string;
  quantity: number;
  amount: number;
}

interface PurchaseOrder {
  id: string;
  timestamp: number;
  buyer: string;
  total: number;
  items: PurchaseItem[];
}

/**
 * Stellt aggregierte Kennzahlen für den Admin-Bereich bereit. Die Berechnung
 * passiert bewusst hier im Backend: der Client erhält nur fertige Zahlen und
 * nicht alle Rohdaten (Datensparsamkeit) und muss nicht alle Datensätze laden.
 * Claude AI
 */
export function statisticsRoutes(app: Express) {
  // Statistiken für Admins
  app.use('/api/statistics', authMiddleware, requirePermission(PERMISSIONS.VIEW_STATISTICS));

  app.get('/api/statistics', async (req, res) => {
    try {
      const users: User[] = await req.app.locals.userDao.findAll();
      const drinks: Drink[] = await req.app.locals.drinkDao.findAll();
      const inventory: InventoryItem[] = await req.app.locals.inventoryDao.findAll();
      const stockEntries: StockEntry[] = await req.app.locals.stockEntryDao.findAll();
      const orders: Order[] = await req.app.locals.orderDao.findAll();
      const payments: Payment[] = await req.app.locals.paymentDao.findAll();

      res.json({
        members: buildMemberStats(users),
        finance: buildFinanceStats(users, orders, payments),
        inventory: buildInventoryStats(drinks, inventory, stockEntries, users),
        consumption: buildConsumptionStats(onlyDrinkOrders(orders))
      });
    } catch (error) {
      console.error('Fehler beim Berechnen der Statistiken:', error);
      res.status(500).json({ error: 'Serverfehler beim Berechnen der Statistiken' });
    }
  });
}

function buildMemberStats(users: User[]) {
  const byStatus: Record<User['status'], number> = { active: 0, pending: 0, suspended: 0, inactive: 0 };
  const byRole: Record<User['role'], number> = { admin: 0, user: 0, theke: 0, kasse: 0 };

  for (const user of users) {
    byStatus[user.status] = (byStatus[user.status] ?? 0) + 1;
    byRole[user.role] = (byRole[user.role] ?? 0) + 1;
  }

  return {
    total: users.length,
    byStatus,
    byRole,
    newPerMonth: groupCountByMonth(users.map(user => user.createdAt))
  };
}

function buildFinanceStats(users: User[], orders: Order[], payments: Payment[]) {
  const balances = balancesByUser(orders, payments);
  let totalDebt = 0;
  let totalCredit = 0;
  const debtors: Debtor[] = [];

  for (const user of users) {
    const balance = balances.get(user.id) ?? 0;
    if (balance < 0) {
      totalDebt += -balance;
      debtors.push({ name: `${user.firstName} ${user.lastName}`, balance });
    } else if (balance > 0) {
      totalCredit += balance;
    }
  }

  // Negativste Salden zuerst -> die größten Schuldner stehen oben
  debtors.sort((a, b) => a.balance - b.balance);

  return {
    totalDebt: round2(totalDebt),
    totalCredit: round2(totalCredit),
    netBalance: round2(totalCredit - totalDebt),
    debtorCount: debtors.length,
    topDebtors: debtors.slice(0, 5)
  };
}

//Mit Hilfe von Claude AI
function buildInventoryStats(drinks: Drink[], inventory: InventoryItem[], stockEntries: StockEntry[], users: User[]) {
  const stockByDrink = new Map<string, number>();
  for (const item of inventory) {
    stockByDrink.set(item.drinkId, item.stock);
  }

  let totalStockValue = 0;
  let outOfStockCount = 0;
  const lowStock: LowStockDrink[] = [];

  for (const drink of drinks) {
    const stock = stockByDrink.get(drink.id) ?? 0;
    totalStockValue += stock * drink.price;
    if (stock === 0) {
      outOfStockCount++;
    }

    // manuell gesetzte Grenze hat Vorrang, sonst der Default je Verpackung
    const threshold = effectiveThreshold(drink);
    if (stock < threshold) {
      lowStock.push({
        drinkId: drink.id,
        name: drink.name,
        packaging: drink.packaging,
        unit: drink.unit,
        stock,
        threshold,
        price: drink.price
      });
    }
  }

  // Knappste zuerst, damit der Admin sofort die dringendsten Fälle sieht
  lowStock.sort((a, b) => a.stock - b.stock);

  return {
    distinctDrinks: drinks.length,
    totalStockValue: round2(totalStockValue),
    outOfStockCount,
    lowStock,
    restockPerMonth: groupSumByMonth(
      stockEntries.map(entry => ({ timestamp: entry.timestamp, value: entry.quantityAdded }))
    ),
    recentPurchases: buildRecentPurchaseOrders(stockEntries, users)
  };
}

// Wareneingänge zu Bestellungen gruppieren (alle Positionen mit derselben batchId gehören zusammen).
// Liefert die letzten 10 Bestellungen, neueste zuerst, je mit Positionen, Gesamtwert und Käufer.
// Claude AI
function buildRecentPurchaseOrders(stockEntries: StockEntry[], users: User[]): PurchaseOrder[] {
  const nameByUser = new Map(users.map(user => [user.id, `${user.firstName} ${user.lastName}`]));
  const byBatch = new Map<string, PurchaseOrder>();

  for (const entry of stockEntries) {
    const batchId = entry.batchId || entry.id; // Fallback für Altdaten ohne Bestell-ID
    const quantity = Number(entry.quantityAdded);
    const amount = round2(quantity * Number(entry.price));
    const order = byBatch.get(batchId) ?? {
      id: batchId,
      timestamp: Number(entry.timestamp),
      buyer: nameByUser.get(entry.userId) ?? 'System',
      total: 0,
      items: []
    };
    order.items.push({ drinkName: entry.drinkName, quantity, amount });
    order.total = round2(order.total + amount);
    order.timestamp = Math.max(order.timestamp, Number(entry.timestamp));
    byBatch.set(batchId, order);
  }

  return [...byBatch.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
}

function buildConsumptionStats(orders: Order[]) {
  // PostgreSQL liefert NUMERIC/BIGINT als Strings -> beim Rechnen in Zahlen wandeln
  let totalQuantity = 0;
  for (const order of orders) {
    totalQuantity += Math.abs(Number(order.value));
  }

  // Nur die Bestellungen der letzten 30 Tage für die kurzfristige Auswertung
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const recentWindow = orders.filter(order => Number(order.createdAt) >= cutoff);

  return {
    totalOrders: orders.length,
    totalRevenue: round2(totalQuantity),
    topDrinks: topDrinksByQuantity(orders),
    topDrinksLast30Days: topDrinksByQuantity(recentWindow)
  };
}

// Summiert die getrunkene Menge je Getränk und liefert die meistgetrunkenen zuerst.
// "Am meisten getrunken" heißt hier: höchste Summe der bestellten Einheiten.
// Gruppiert wird nach drinkId, damit z.B. Krombacher 0,33l und Krombacher 50L
// als eigene Produkte gezählt werden – nicht nur nach dem gleichen Namen.
// Chat GPT
function topDrinksByQuantity(orders: Order[]): TopDrink[] {
  const byDrink = new Map<string, { name: string; unit: string; count: number; totalValue: number }>();
  for (const order of orders) {
    const amount = Math.abs(Number(order.value));
    const aggregate = byDrink.get(order.drinkId) ?? { name: order.name, unit: order.unit, count: 0, totalValue: 0 };
    aggregate.count++;
    aggregate.totalValue += amount;
    byDrink.set(order.drinkId, aggregate);
  }
  return [...byDrink.values()]
    .map(v => ({ name: v.name, unit: v.unit, count: v.count, totalValue: round2(v.totalValue) }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 8);
}

// Zählt, wie viele Zeitstempel auf denselben Monat (YYYY-MM) fallen.
function groupCountByMonth(timestamps: number[]) {
  const counts = new Map<string, number>();
  for (const timestamp of timestamps) {
    const month = toMonthKey(timestamp);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return toSortedMonthArray(counts).map(([month, count]) => ({ month, count }));
}

// Summiert Werte (z. B. nachbestellte Mengen) pro Monat (YYYY-MM).
function groupSumByMonth(items: { timestamp: number; value: number }[]) {
  const totals = new Map<string, number>();
  for (const item of items) {
    const month = toMonthKey(item.timestamp);
    totals.set(month, (totals.get(month) ?? 0) + item.value);
  }
  return toSortedMonthArray(totals).map(([month, quantity]) => ({ month, quantity }));
}

function toMonthKey(timestamp: number): string {
  // PostgreSQL liefert BIGINT-Zeitstempel als String -> erst in eine Zahl wandeln
  return new Date(Number(timestamp)).toISOString().slice(0, 7); // 'YYYY-MM'
}

function toSortedMonthArray(map: Map<string, number>): [string, number][] {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
