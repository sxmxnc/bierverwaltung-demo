/* Autor: Julius Vollmer (FH Münster) */

export interface MemberStats {
  total: number;
  byStatus: { active: number; pending: number; suspended: number; inactive: number };
  byRole: { admin: number; user: number; theke: number; kasse: number };
  newPerMonth: { month: string; count: number }[];
}

export interface FinanceStats {
  totalDebt: number; // Summe offener Forderungen
  totalCredit: number;
  netBalance: number;
  debtorCount: number;
  topDebtors: { name: string; balance: number }[];
}

export interface LowStockDrink {
  drinkId: string;
  name: string;
  packaging: 'Flasche' | 'Fass';
  unit: string;
  stock: number;
  threshold: number;
  price: number;
}

export interface InventoryStats {
  distinctDrinks: number;
  totalStockValue: number;
  outOfStockCount: number;
  lowStock: LowStockDrink[];
  restockPerMonth: { month: string; quantity: number }[];
  recentPurchases: PurchaseOrder[];
}

export interface TopDrink {
  name: string;
  unit: string;
  count: number;
  totalValue: number;
}

export interface PurchaseItem {
  drinkName: string;
  quantity: number;
  amount: number;
}

export interface PurchaseOrder {
  id: string;
  timestamp: number;
  buyer: string;
  total: number;
  items: PurchaseItem[];
}

export interface ConsumptionStats {
  totalOrders: number;
  totalRevenue: number; // Gesamtzahl der verkauften Getränken
  topDrinks: TopDrink[]; // gesamter Zeitraum
  topDrinksLast30Days: TopDrink[]; // nur die letzten 30 Tage
}

export interface Statistics {
  members: MemberStats;
  finance: FinanceStats;
  inventory: InventoryStats;
  consumption: ConsumptionStats;
}
