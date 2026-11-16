/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Entity } from './entity.js';

export type BankStatus = 'offen' | 'zugeordnet' | 'ignoriert' | 'vor_stichtag';
export const BANK_CATEGORIES = ['rechnung', 'roth', 'intern', 'bar', 'spende', 'sonstiges'] as const;
export type BankCategory = (typeof BANK_CATEGORIES)[number];

export interface BankImport extends Entity {
  fileName: string;
  fileHash: string;
  importedById: string;
  firstDate: string | null;
  lastDate: string | null;
  rows: number;
  added: number;
  known: number;
  warnings: string[];
}

export interface BankTransactionRecord extends Entity {
  fingerprint: string;
  accountIban: string;
  bookingDate: string;
  valueDate: string;
  name: string;
  iban: string;
  bookingText: string;
  purpose: string;
  amount: number; // Eingang positiv, Ausgang negativ (Euro)
  balanceAfter: number | null;
  status: BankStatus;
  category: BankCategory | null; // Zweck des Teils, der nicht auf ein Personenkonto geht
  note: string;
  importId: string;
  decidedById: string | null;
  decidedAt: number | null;
}

export interface BankIban extends Entity {
  iban: string;
  userId: string | null;
  askAlways: boolean;
}
