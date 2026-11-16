/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

// Mitglieder-Import aus der Excel-Bilanz (Prüfdatei von scripts/bilanz-export.ts)

export interface MemberImportRow {
  line: number;
  source: string;
  category: string;
  status: 'aktiv' | 'inaktiv';
  lastName: string;
  firstName: string;
  nickname: string;
  email: string;
  balanceCents: number; // wie in der Excel: positiv = Schulden
  include: boolean;
  kontoId: string;
  action: 'anlegen' | 'zuordnen' | 'ueberspringen' | 'schon_uebernommen' | 'fehler';
  targetId: string | null;
  targetName: string | null;
  reason: string;
}

export interface MemberImportPreview {
  meta: string;
  errors: string[];
  rows: MemberImportRow[];
  totals: { rows: number; create: number; link: number; skip: number; done: number; debt: number; credit: number };
  demoLogins: boolean;
}

export interface MemberImportResult {
  created: number;
  linked: number;
  check: { fileDebt: number; fileCredit: number; appDebt: number; appCredit: number };
}
