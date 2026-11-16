import { Entity } from './entity.js';

export interface Payment extends Entity {
  userId: string;
  amount: number;
  note: string;
  date: string;
  createdByAdminId: string;
  kind?: PaymentKind | null; // fehlt = Einzahlung bzw. Korrektur
  source?: string | null; // Herkunft, z. B. "Bilanz November 2026, Blatt AH, Zeile 31"
  bankTransactionId?: string | null; // Zahlung aus dem Bank-Journal
}

// uebertrag = Eröffnungsbuchung aus der Excel-Bilanz (je Konto höchstens einmal)
export type PaymentKind = 'uebertrag';
