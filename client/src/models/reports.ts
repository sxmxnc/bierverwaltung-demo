/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

export type ScoreboardPeriod = 'week' | 'month' | 'all';
export type ReportPeriod = 'week' | 'month' | 'lastMonth' | 'all';

export interface ScoreEntry {
  rank: number;
  id: string;
  name: string;
  liters: number;
  count: number;
}

export interface Scoreboard {
  period: ScoreboardPeriod;
  from: string | null;
  totalLiters: number;
  entries: ScoreEntry[];
  me: ScoreEntry | null;
}

export interface ConsumptionMember {
  id: string;
  name: string;
  fullName: string;
  kind: 'member' | 'kasse';
  status: string;
  balance: number;
  count: number;
  amount: number;
  beerLiters: number;
  drinks: { name: string; unit: string; count: number; amount: number }[];
}

export interface ConsumptionReport {
  period: ReportPeriod;
  from: string | null;
  to: string | null;
  totals: { count: number; amount: number; beerLiters: number };
  members: ConsumptionMember[];
}

export interface InventoryItemReport {
  drinkId: string;
  name: string;
  unit: string;
  packaging: 'Flasche' | 'Fass';
  price: number;
  isBeer: boolean;
  tracked: boolean;
  stock: number;
  threshold: number;
  status: 'ok' | 'low' | 'empty' | 'untracked';
  sold7: number;
  sold30: number;
  liters7: number;
  liters30: number;
  daysLeft: number | null;
  stockValue: number;
}

export interface InventoryReport {
  items: InventoryItemReport[];
  totals: { stockValue: number; low: number; empty: number; draftLiters30: number };
}
