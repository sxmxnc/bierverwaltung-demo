/* Autor: Marius Middrup (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { Entity } from './entity.js';

export interface Order extends Entity {
  userId: string; // auf wessen Konto gestrichelt wurde
  bookedById?: string | null; // wer gestrichelt hat (z. B. Bundesbruder oder Theke)
  drinkId: string;
  name: string;
  unit: string;
  value: number;
  price: number;
  date: Date;
  // Herkunft: fehlt = in der App gestrichelt, sonst aus der Backup-Strichliste bzw. vom Bierwart nachgetragen
  source?: OrderSource | null;
  importId?: string | null; // tallyimports.id bei importierten Strichen
  note?: string | null;
}

export type OrderSource = 'strichliste' | 'nachtrag';

// In die Rangliste zählt nur, was in der App gestrichelt wurde (die Papierliste ist nur ein Backup).
export function countsForScoreboard(order: Pick<Order, 'source'>): boolean {
  return !order.source;
}
