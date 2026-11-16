/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { CellSource, columnLetters, FormulaEvaluator } from './formula.js';

// Liest die Personenkonten aus der Excel-Bilanz der Bierkasse (Blätter "Bbr_ Ak_ FK", "AH",
// "Hb_ Gäste_ Damen"), rechnet jeden Kontostand selbst nach und prüft die Summen gegen das
// Blatt "Bilanz". Ergebnis ist die Prüfdatei für den Mitglieder-Import (siehe docs/PLAN-IMPORT.md).

export type ImportCategory = 'aktiv' | 'ah' | 'hausbewohner' | 'gast' | 'verein' | 'kasse';

export interface BilanzAccount {
  source: string; // Blatt!Zeile
  sheet: string;
  row: number;
  category: ImportCategory;
  status: 'aktiv' | 'inaktiv';
  lastName: string;
  firstName: string;
  nickname: string;
  email: string;
  balanceCents: number; // wie in der Excel: positiv = Schulden
  kontoId: string; // vorbelegt für die Kassen
}

export interface BilanzCheck {
  label: string;
  expectedCents: number; // laut Blatt "Bilanz"
  actualCents: number; // Summe der gelesenen Konten
}

export interface BilanzResult {
  accounts: BilanzAccount[];
  checks: BilanzCheck[];
  warnings: string[];
  ok: boolean;
}

export interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
}

export const PERSON_SHEETS = { aktive: 'Bbr_ Ak_ FK', ah: 'AH', hb: 'Hb_ Gäste_ Damen' } as const;

// Kassen und Vereine in den Personenblättern
const SPECIAL: Record<string, { category: ImportCategory; kontoId: string }> = {
  aktivenkasse: { category: 'kasse', kontoId: 'kasse-aktivenkasse' },
  fuchsenkasse: { category: 'kasse', kontoId: 'kasse-fuxenkasse' },
  fuxenkasse: { category: 'kasse', kontoId: 'kasse-fuxenkasse' },
  ahv: { category: 'verein', kontoId: '' },
  hbv: { category: 'verein', kontoId: '' }
};

const cents = (euro: number) => Math.round(euro * 100);
const clean = (v: unknown) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' ? String(v) : '';
const norm = (v: string) => v.toLowerCase().replace(/[^a-zäöüß]/g, '');

interface Layout {
  headerRow: number;
  name: number;
  firstName: number | null;
  nickname: number | null;
  email: number | null;
  carry: number; // Übertrag
  balance: number; // Kontostand
}

function findLayout(source: CellSource, sheet: string, info: SheetInfo): Layout {
  for (let r = 1; r <= Math.min(10, info.rowCount); r++) {
    const headers = new Map<string, number>();
    for (let c = 1; c <= info.columnCount; c++) {
      const text = clean(source.cell(sheet, `${columnLetters(c)}${r}`).value);
      if (text && !headers.has(norm(text))) headers.set(norm(text), c);
    }
    const carry = [...headers.entries()].find(([h]) => h.startsWith('übertr'))?.[1];
    const balance = headers.get('kontostand');
    const name = headers.get('name');
    if (carry && balance && name) {
      // In "Bbr_ Ak_ FK" steht der Vorname ohne Überschrift direkt neben dem Namen
      const firstName = headers.get('vorname') ?? (carry - name >= 3 ? name + 1 : null);
      return {
        headerRow: r,
        name,
        firstName,
        nickname: headers.get('vulgo') ?? headers.get('vo') ?? null,
        email: headers.get('email') ?? null,
        carry,
        balance
      };
    }
  }
  throw new Error(`Blatt „${sheet}“: Kopfzeile mit Name, Übertrag und Kontostand nicht gefunden.`);
}

function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

export function readBilanz(source: CellSource, sheets: SheetInfo[]): BilanzResult {
  const evaluator = new FormulaEvaluator(source);
  const warnings: string[] = [];
  const accounts: BilanzAccount[] = [];
  const byName = new Map(sheets.map(s => [s.name, s]));

  for (const [key, sheet] of Object.entries(PERSON_SHEETS)) {
    const info = byName.get(sheet);
    if (!info) throw new Error(`Blatt „${sheet}“ fehlt in der Datei.`);
    const layout = findLayout(source, sheet, info);
    const cell = (c: number | null, r: number) => (c ? source.cell(sheet, `${columnLetters(c)}${r}`) : null);
    const isHb = key === 'hb';
    let section: { category: ImportCategory; status: 'aktiv' | 'inaktiv' } = {
      category: key === 'aktive' ? 'aktiv' : key === 'ah' ? 'ah' : 'hausbewohner',
      status: 'aktiv'
    };
    let emptyRun = 0;

    for (let r = layout.headerRow + 1; r <= info.rowCount && emptyRun < 3; r++) {
      const name = clean(cell(layout.name, r)!.value);
      const balanceCell = cell(layout.balance, r)!;
      const carryCell = cell(layout.carry, r)!;
      const address = `${columnLetters(layout.balance)}${r}`;

      // Summenblock unter den Konten (SUMIF bzw. "Gesamt"): Ende des Blatts
      if (/SUMIF/i.test(balanceCell.formula ?? '') || /^(gesamt|summe)$/.test(norm(name))) break;

      if (!name) {
        if (!balanceCell.formula && carryCell.value === null) emptyRun++;
        else {
          emptyRun = 0;
          const value = cents(evaluator.number(sheet, address));
          if (value !== 0)
            warnings.push(`${sheet} Zeile ${r}: Kontostand ${value / 100} € ohne Namen – nicht übernommen.`);
        }
        continue;
      }
      emptyRun = 0;

      // Abschnittszeilen im Hausbewohner-Blatt ("Ehemalige Hausbewohner", "Gäste")
      const n = norm(name);
      const isSection = /^(ehemalige|gäste|gaeste|hausbewohner|damen)/.test(n);
      if (isHb && !balanceCell.formula && (isSection || carryCell.value === null || carryCell.value === '')) {
        if (n.includes('ehemalige')) section = { category: 'hausbewohner', status: 'inaktiv' };
        else if (n.startsWith('gäste') || n.startsWith('gaeste')) section = { category: 'gast', status: 'aktiv' };
        else if (n.startsWith('hausbewohner')) section = { category: 'hausbewohner', status: 'aktiv' };
        else warnings.push(`${sheet} Zeile ${r}: „${name}“ hat keinen Kontostand – nicht übernommen.`);
        continue;
      }

      let balance: number;
      if (balanceCell.formula) {
        balance = evaluator.number(sheet, address);
      } else if (typeof balanceCell.value === 'number') {
        balance = balanceCell.value;
        warnings.push(`${sheet} Zeile ${r} (${name}): Kontostand ist ein fester Wert statt einer Formel.`);
      } else {
        // Zeile ohne Kontostand-Formel (z. B. Slobbe): Übertrag und Buchungen von Hand addieren
        balance = 0;
        for (let c = layout.carry; c < layout.balance; c++)
          balance += evaluator.number(sheet, `${columnLetters(c)}${r}`);
        warnings.push(`${sheet} Zeile ${r} (${name}): keine Kontostand-Formel, Summe der Zeile verwendet.`);
      }

      const special = SPECIAL[norm(name)];
      const names = isHb ? splitFullName(name) : { lastName: name, firstName: clean(cell(layout.firstName, r)?.value) };
      if (/^x+$/i.test(names.firstName)) names.firstName = '';
      if (isHb && name.split(' ').length > 2) {
        warnings.push(`${sheet} Zeile ${r}: „${name}“ – bitte Vor- und Nachnamen in der Prüfdatei kontrollieren.`);
      }
      const email = clean(cell(layout.email, r)?.value).toLowerCase();
      accounts.push({
        source: `${sheet}!${r}`,
        sheet,
        row: r,
        category: special?.category ?? section.category,
        status: section.status,
        lastName: names.lastName,
        firstName: names.firstName,
        nickname: clean(cell(layout.nickname, r)?.value),
        // Platzhalter wie "xxxx@sauerlandia.de" sind keine echte Adresse
        email: /^x+@/.test(email) || !email.includes('@') ? '' : email,
        balanceCents: cents(balance),
        kontoId: special?.kontoId ?? ''
      });
    }
  }

  // Gegenprobe mit dem Blatt "Bilanz": Forderungen (Aktiva B9–B15) und Verbindlichkeiten (Passiva E9–E15)
  const checks: BilanzCheck[] = [];
  if (byName.has('Bilanz')) {
    const sum = (col: string) =>
      [9, 10, 11, 12, 13, 14, 15].reduce((s, r) => s + cents(evaluator.number('Bilanz', `${col}${r}`)), 0);
    checks.push({
      label: 'Forderungen (Schulden der Konten)',
      expectedCents: sum('B'),
      actualCents: accounts.reduce((s, a) => s + Math.max(0, a.balanceCents), 0)
    });
    checks.push({
      label: 'Verbindlichkeiten (Guthaben der Konten)',
      expectedCents: sum('E'),
      actualCents: -accounts.reduce((s, a) => s + Math.min(0, a.balanceCents), 0)
    });
  } else {
    warnings.push('Blatt „Bilanz“ fehlt – Summen nicht geprüft.');
  }

  const emails = new Map<string, string>();
  for (const a of accounts.filter(account => account.email)) {
    const other = emails.get(a.email);
    if (other) warnings.push(`E-Mail ${a.email} kommt doppelt vor (${other} und ${a.source}).`);
    emails.set(a.email, a.source);
  }

  return { accounts, checks, warnings, ok: checks.every(c => c.expectedCents === c.actualCents) };
}

// Prüfdatei: Semikolon, deutsche Beträge, UTF-8 mit BOM (öffnet sich in Excel direkt richtig)
export const IMPORT_CSV_HEADER = [
  'quelle',
  'kategorie',
  'status',
  'nachname',
  'vorname',
  'vulgo',
  'email',
  'saldo_excel',
  'importieren',
  'konto_id'
];

export function toImportCsv(result: BilanzResult, meta: string): string {
  const q = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [
    `# ${meta}`,
    IMPORT_CSV_HEADER.join(';'),
    ...result.accounts.map(a =>
      [
        a.source,
        a.category,
        a.status,
        a.lastName,
        a.firstName,
        a.nickname,
        a.email,
        (a.balanceCents / 100).toFixed(2).replace('.', ','),
        'ja',
        a.kontoId
      ]
        .map(q)
        .join(';')
    )
  ];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
