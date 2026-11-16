/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

export type AccountEntryKind = 'order' | 'sepa' | 'deposit' | 'correction';

export interface AccountEntry {
  id: string;
  kind: AccountEntryKind;
  date: string;
  title: string;
  quantity?: number;
  amount: number; // Striche negativ, Einzahlungen positiv
  bookedBy?: string; // gesetzt, wenn jemand anderes für dich gestrichelt hat
  canUndo?: boolean;
  origin?: string; // Backup-Strichliste bzw. vom Bierwart nachgetragen
}

export interface Account {
  balance: number;
  entries: AccountEntry[];
}

// Eigene Buchung der letzten Minuten (für "Rückgängig")
export interface RecentBooking {
  id: string;
  targetId: string;
  targetName: string;
  name: string;
  unit: string;
  quantity: number;
  amount: number;
  undoUntil: number;
}

export interface TallyResult {
  target: { id: string; name: string };
  orders: { id: string; name: string; unit: string; value: number; price: number }[];
  total: number;
}
