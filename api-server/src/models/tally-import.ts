/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Entity } from './entity.js';

// gebucht = Striche stehen auf den Konten; bilanz = Liste ist schon in der Excel-Bilanz erfasst
// (nur gemerkt, nicht gebucht); ersetzt = durch eine korrigierte Fassung abgelöst; zurueckgenommen = storniert
export type TallyImportStatus = 'gebucht' | 'bilanz' | 'ersetzt' | 'zurueckgenommen';

export interface TallyImportLine {
  userId: string;
  toolPersonId: string;
  drinkKey: string;
  count: number;
  price: number;
}

export interface TallyImport extends Entity {
  listKey: string; // "uid:<uid>" (Tool ab Version 2) oder "v1:<Inhalts-Prüfsumme>"
  listName: string;
  listDate?: string | null; // Datum laut Tool (JJJJ-MM-TT)
  bookingDate?: string | null; // tatsächlich gebuchter Tag
  contentHash: string;
  status: TallyImportStatus;
  fileName: string;
  toolVersion: number;
  personCount: number;
  strokeCount: number;
  total: number;
  lines: TallyImportLine[];
  importedById: string;
  closedAt?: number | null;
  closedById?: string | null;
}

export interface TallyAlias extends Entity {
  aliasKey: string;
  userId: string;
}
