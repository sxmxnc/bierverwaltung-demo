/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

// Import der Backup-Strichliste aus dem Erfassungs-Tool (siehe docs/STRICHLISTEN-FORMAT.md)

export type ListStatus = 'neu' | 'geaendert' | 'importiert' | 'bilanz' | 'leer';
export type ListAction = 'buchen' | 'ersetzen' | 'bilanz' | 'ueberspringen';
export type PersonConfidence = 'sicher' | 'vorschlag' | 'offen';
export type ImportStatus = 'gebucht' | 'bilanz' | 'ersetzt' | 'zurueckgenommen';

export interface PreviewList {
  key: string;
  name: string;
  datum: string | null;
  monat: string | null;
  notiz: string;
  status: ListStatus;
  actions: ListAction[];
  defaultAction: ListAction;
  personCount: number;
  strokeCount: number;
  total: number;
  previous: { id: string; listName: string; status: ImportStatus; importedAt: string; total: number } | null;
}

export interface PreviewPerson {
  toolId: string;
  label: string;
  gruppe: string;
  strokes: number;
  lists: string[];
  match: { userId: string | null; confidence: PersonConfidence; reason: string };
}

export interface ImportAccount {
  id: string;
  name: string;
  fullName: string;
  role: string;
}

export interface TallyImportPreview {
  version: number;
  typ: string;
  savedAt: string | null;
  warnings: string[];
  missingDrinks: string[];
  lists: PreviewList[];
  persons: PreviewPerson[];
  accounts: ImportAccount[];
}

export interface BookRequest {
  fileName: string;
  file: unknown;
  lists: Record<string, { action: ListAction; bookingDate?: string }>;
  persons: Record<string, string>;
}

export interface BookResult {
  booked: number;
  marked: number;
  orders: number;
  total: number;
}

export interface TallyImportEntry {
  id: string;
  listName: string;
  listDate: string | null;
  bookingDate: string | null;
  status: ImportStatus;
  fileName: string;
  personCount: number;
  strokeCount: number;
  total: number;
  importedAt: string;
  importedBy: string;
  closedAt: string | null;
}

export interface BackfillEntry {
  id: string;
  date: string;
  createdAt: string;
  target: string;
  title: string;
  quantity: number;
  amount: number;
  note: string;
  bookedBy: string;
}
