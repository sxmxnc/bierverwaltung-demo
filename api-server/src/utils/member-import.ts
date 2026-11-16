/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Payment } from '../models/payment.js';
import { User, UserCategory } from '../models/user-auth.js';
import { IMPORT_CSV_HEADER, ImportCategory } from './bilanz.js';
import { normalizeName } from './tally-file.js';

// Mitglieder-Import aus der Prüfdatei (scripts/bilanz-export.ts, von Simon in Excel geprüft):
// Konten anlegen bzw. vorhandenen Konten zuordnen und je Konto genau einen Übertrag buchen.

export class MemberImportError extends Error {}

export interface ImportRow {
  line: number;
  source: string;
  category: ImportCategory;
  status: 'aktiv' | 'inaktiv';
  lastName: string;
  firstName: string;
  nickname: string;
  email: string;
  balanceCents: number; // wie in der Excel: positiv = Schulden
  include: boolean;
  kontoId: string;
}

export type RowAction = 'anlegen' | 'zuordnen' | 'ueberspringen' | 'schon_uebernommen' | 'fehler';

export interface PlannedRow extends ImportRow {
  action: RowAction;
  targetId: string | null;
  reason: string;
}

const CATEGORIES: ImportCategory[] = ['aktiv', 'ah', 'hausbewohner', 'gast', 'verein', 'kasse'];

// Semikolon-CSV wie aus Excel ("CSV UTF-8" oder "CSV (Trennzeichen-getrennt)"); Zeilen mit # sind Kommentare
export function parseImportCsv(text: string): { rows: ImportRow[]; errors: string[]; meta: string } {
  const lines = splitCsv(text.replace(/^\uFEFF/, ''));
  const meta =
    lines
      .find(l => l.fields[0]?.startsWith('#'))
      ?.fields.join(';')
      .replace(/^#\s*/, '') ?? '';
  const content = lines.filter(l => !l.fields[0]?.startsWith('#') && l.fields.some(f => f.trim()));
  const header = content.shift();
  if (!header) throw new MemberImportError('Die Datei ist leer.');
  const columns = header.fields.map(f => f.trim().toLowerCase());
  const missing = IMPORT_CSV_HEADER.filter(h => h !== 'konto_id' && !columns.includes(h));
  if (missing.length) {
    throw new MemberImportError(
      `In der Kopfzeile fehlen Spalten: ${missing.join(', ')}. Bitte die Prüfdatei aus „npm run bilanz-export“ verwenden.`
    );
  }
  const col = (fields: string[], name: string) => (fields[columns.indexOf(name)] ?? '').trim();

  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const sources = new Set<string>();
  for (const { line, fields } of content) {
    const where = `Zeile ${line}`;
    const category = col(fields, 'kategorie').toLowerCase() as ImportCategory;
    const status = col(fields, 'status').toLowerCase();
    const include = !/^(nein|n|0|no)$/i.test(col(fields, 'importieren'));
    const balance = parseEuro(col(fields, 'saldo_excel'));
    const source = col(fields, 'quelle') || where;
    const email = col(fields, 'email').toLowerCase();

    if (!CATEGORIES.includes(category)) errors.push(`${where}: unbekannte Kategorie „${col(fields, 'kategorie')}“`);
    if (!['aktiv', 'inaktiv'].includes(status)) errors.push(`${where}: Status muss „aktiv“ oder „inaktiv“ sein`);
    if (balance === null) errors.push(`${where}: Saldo „${col(fields, 'saldo_excel')}“ ist keine Zahl`);
    if (!col(fields, 'nachname') && !col(fields, 'vorname')) errors.push(`${where}: Name fehlt`);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`${where}: E-Mail „${email}“ ist ungültig`);
    if (sources.has(source)) errors.push(`${where}: Quelle „${source}“ kommt doppelt vor`);
    sources.add(source);

    rows.push({
      line,
      source,
      category,
      status: status === 'inaktiv' ? 'inaktiv' : 'aktiv',
      lastName: col(fields, 'nachname'),
      firstName: col(fields, 'vorname'),
      nickname: col(fields, 'vulgo'),
      email,
      balanceCents: balance ?? 0,
      include,
      kontoId: col(fields, 'konto_id')
    });
  }

  const emails = new Map<string, number>();
  for (const row of rows.filter(r => r.include && r.email)) {
    if (emails.has(row.email))
      errors.push(`Zeile ${row.line}: E-Mail ${row.email} steht auch in Zeile ${emails.get(row.email)}`);
    emails.set(row.email, row.line);
  }
  return { rows, errors, meta };
}

// "1.234,56", "-7,15", "0", "12.5" → Cent
export function parseEuro(value: string): number | null {
  const v = value.replace(/[\s€]/g, '');
  if (!v) return 0;
  const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
  if (!/^[-+]?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

// Aktivenkasse und Fuxenkasse stehen im Blatt der Aktiven
export function appCategory(category: ImportCategory): UserCategory {
  return category === 'kasse' ? 'aktiv' : category;
}

// Für jede Zeile entscheiden: neues Konto, vorhandenes Konto, überspringen – oder schon übernommen
export function planImport(rows: ImportRow[], users: User[], payments: Payment[]): PlannedRow[] {
  const candidates = users.filter(user => user.role !== 'theke');
  const withTransfer = new Set(payments.filter(p => p.kind === 'uebertrag').map(p => p.userId));
  const used = new Map<string, number>();

  const planned = rows.map((row): PlannedRow => {
    if (!row.include) return { ...row, action: 'ueberspringen', targetId: null, reason: 'importieren = nein' };

    let target: User | undefined;
    let reason = '';
    if (row.kontoId) {
      target = candidates.find(user => user.id === row.kontoId);
      if (!target) return { ...row, action: 'fehler', targetId: null, reason: `Konto ${row.kontoId} gibt es nicht` };
      reason = 'konto_id';
    }
    if (!target && row.email) {
      target = candidates.find(user => user.email.toLowerCase() === row.email);
      if (target) reason = 'gleiche E-Mail';
    }
    if (!target) {
      const isAccount = row.category === 'kasse' || row.category === 'verein';
      const sameName = candidates.filter(user =>
        // Sammelkonten (AHV, HBV …) heißen in der App wie die Kasse: Name im Feld firstName
        isAccount && user.role === 'kasse'
          ? normalizeName(user.firstName) === normalizeName(row.lastName || row.firstName)
          : normalizeName(user.lastName) === normalizeName(row.lastName) &&
            normalizeName(user.firstName) === normalizeName(row.firstName) &&
            !!(row.lastName || row.firstName)
      );
      if (sameName.length > 1) {
        return {
          ...row,
          action: 'fehler',
          targetId: null,
          reason: 'mehrere Konten mit diesem Namen – konto_id eintragen'
        };
      }
      target = sameName[0];
      if (target) reason = 'gleicher Name';
    }

    if (!target) return { ...row, action: 'anlegen', targetId: null, reason: 'neues Konto' };
    if (withTransfer.has(target.id)) {
      return { ...row, action: 'schon_uebernommen', targetId: target.id, reason: 'Übertrag ist schon gebucht' };
    }
    return { ...row, action: 'zuordnen', targetId: target.id, reason };
  });

  // Ein Konto darf nur einmal Ziel sein
  for (const row of planned)
    if (row.targetId && row.action === 'zuordnen') used.set(row.targetId, (used.get(row.targetId) ?? 0) + 1);
  return planned.map(row =>
    row.targetId && row.action === 'zuordnen' && (used.get(row.targetId) ?? 0) > 1
      ? { ...row, action: 'fehler', reason: 'mehrere Zeilen passen auf dasselbe Konto' }
      : row
  );
}

interface CsvLine {
  line: number;
  fields: string[];
}

function splitCsv(text: string): CsvLine[] {
  const delimiter = (text.split(/\r?\n/).find(l => l.trim() && !l.startsWith('#')) ?? '').includes(';') ? ';' : ',';
  const result: CsvLine[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      fields.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      fields.push(field);
      result.push({ line: start, fields });
      fields = [];
      field = '';
      line++;
      start = line;
    } else field += c;
  }
  if (field || fields.length) {
    fields.push(field);
    result.push({ line: start, fields });
  }
  return result;
}
