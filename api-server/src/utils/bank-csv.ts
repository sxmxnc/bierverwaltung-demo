/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia (aus Branch zahlungseingang, erweitert um Saldo und Valuta) */

import { createHash } from 'node:crypto';

// Liest den CSV-Export der Kontoumsätze aus dem Online-Banking (Volksbank/Atruvia, aber bewusst tolerant):
// Semikolon (notfalls Tab oder Komma), Kopfzeile irgendwo in den ersten Zeilen, deutsches Zahlen- und
// Datumsformat, Betrag mit Vorzeichen oder als Betrag plus Soll/Haben-Spalte (älteres VR-Format).

export interface BankTransaction {
  line: number; // Zeile in der Datei (1-basiert), um bei Rückfragen die Stelle zu finden
  bookingDate: string; // YYYY-MM-DD
  name: string; // Zahlungsbeteiligter (bei Eingängen: wer überwiesen hat)
  iban: string; // IBAN des Zahlungsbeteiligten, '' wenn nicht im Export
  purpose: string; // Verwendungszweck
  amountCents: number; // Eingänge positiv, Ausgänge negativ
  currency: string;
  valueDate: string; // Valuta (YYYY-MM-DD), '' wenn nicht im Export
  bookingText: string; // z. B. "Überweisungsgutschr.", "Echtzeitüberweisung"
  balanceAfterCents: number | null; // "Saldo nach Buchung", falls die Bank ihn mitliefert
  accountIban: string; // eigenes Konto ("IBAN Auftragskonto"), '' wenn nicht im Export
  // Stabil über mehrere Exporte hinweg (auch bei überlappenden Zeiträumen), siehe fingerprintOf()
  fingerprint: string;
}

export interface BankCsvResult {
  transactions: BankTransaction[];
  skippedLines: number[]; // Datenzeilen, die nicht gelesen werden konnten
}

export class BankCsvError extends Error {}

type Column =
  | 'bookingDate'
  | 'name'
  | 'iban'
  | 'purpose'
  | 'amount'
  | 'debitCredit'
  | 'currency'
  | 'valueDate'
  | 'bookingText'
  | 'balance'
  | 'accountIban';
type ColumnMap = Partial<Record<Exclude<Column, 'purpose'>, number>> & { purpose: number[] };

interface CsvRecord {
  line: number;
  fields: string[];
}

const DELIMITERS = [';', '\t', ','];
// Kopfzeile muss spätestens hier stehen (davor stehen bei manchen Banken Kontodaten und Zeitraum)
const MAX_HEADER_SEARCH = 30;
// Zeilen wie "Anfangssaldo"/"Endsaldo" am Ende älterer Exporte sind keine Umsätze
const BALANCE_ROWS = new Set(['anfangssaldo', 'endsaldo', 'schlusssaldo', 'kontostand', 'saldo']);

// Bytes aus dem Upload in Text umwandeln: UTF-8 (mit/ohne BOM), sonst Windows-1252 (ältere Exporte).
export function decodeBankCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function parseBankCsv(text: string): BankCsvResult {
  const content = text.replace(/^\uFEFF/, '');
  for (const delimiter of DELIMITERS) {
    const records = splitRecords(content, delimiter);
    const headerIndex = records.slice(0, MAX_HEADER_SEARCH).findIndex(record => isHeader(record.fields));
    if (headerIndex >= 0) {
      const rows = records.slice(headerIndex + 1);
      return readTransactions(mapColumns(records[headerIndex].fields, rows), rows);
    }
  }
  throw new BankCsvError(
    'In der Datei wurde keine Kopfzeile mit Buchungstag und Betrag gefunden. Bitte den CSV-Export der Umsätze aus dem Online-Banking verwenden.'
  );
}

// Deutsche Beträge: "1.234,56", "-12,50", "12,50 €", "+5", "12,50-"; zur Not auch "12.50". Ergebnis in Cent.
export function parseAmount(value: string): number | null {
  let v = value.replace(/[\s\u00a0€]|EUR/gi, '');
  let sign = 1;
  if (v.endsWith('-')) {
    sign = -1;
    v = v.slice(0, -1);
  }
  if (/^[-\u2212]/.test(v)) {
    sign = -1;
    v = v.slice(1);
  } else if (v.startsWith('+')) {
    v = v.slice(1);
  }
  if (v.includes(',')) {
    v = v.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(v)) {
    v = v.replace(/\./g, '');
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v);
  if (!match) return null;
  return sign * (Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')));
}

// "15.10.2026", "15.10.26" oder "2026-10-15" → "2026-10-15"
export function parseDate(value: string): string | null {
  const v = value.trim();
  let year: number, month: number, day: number;
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/.exec(v);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(v);
  if (german) {
    [day, month, year] = [Number(german[1]), Number(german[2]), Number(german[3])];
    if (german[3].length === 2) year += 2000;
  } else if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

// Für Vergleiche: Großbuchstaben, Umlaute ausgeschrieben, nur Buchstaben und Ziffern
export function normalizeKey(value: string): string {
  return transliterate(value.toUpperCase()).replace(/[^A-Z0-9]/g, '');
}

// Inhalt einer Umsatzzeile ohne Formatierungsdetails. Leerzeichen und Zeilenumbrüche im Verwendungszweck
// zählen nicht, weil Banken lange Verwendungszwecke unterschiedlich umbrechen.
export function transactionKey(t: Pick<BankTransaction, 'bookingDate' | 'amountCents' | 'iban' | 'name' | 'purpose'>) {
  return [t.bookingDate, t.amountCents, normalizeKey(t.iban) || normalizeKey(t.name), normalizeKey(t.purpose)].join(
    '|'
  );
}

// Mit "Saldo nach Buchung" ist jede Buchung eindeutig: eigenes Konto, Tage, Betrag und Kontostand danach.
// Der Verwendungszweck gehört bewusst nicht dazu (Banken brechen ihn unterschiedlich um). Ohne Saldo-Spalte
// zählt der Inhalt der Zeile, gleiche Zeilen am selben Tag werden durchgezählt.
export function fingerprintOf(
  t: Pick<
    BankTransaction,
    'bookingDate' | 'valueDate' | 'amountCents' | 'balanceAfterCents' | 'accountIban' | 'iban' | 'name' | 'purpose'
  >,
  occurrence = 0
): string {
  const key =
    t.balanceAfterCents !== null
      ? ['saldo', t.accountIban, t.bookingDate, t.valueDate, t.amountCents, t.balanceAfterCents].join('|')
      : `${transactionKey(t)}#${occurrence}`;
  return createHash('sha256').update(key).digest('hex');
}

function transliterate(value: string): string {
  return value
    .replace(/Ä/g, 'AE')
    .replace(/Ö/g, 'OE')
    .replace(/Ü/g, 'UE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeHeader(value: string): string {
  return transliterate(value.toLowerCase()).replace(/[^a-z0-9]/g, '');
}

function clean(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

// CSV nach RFC 4180: Felder in Anführungszeichen dürfen Trennzeichen, "" und Zeilenumbrüche enthalten.
function splitRecords(text: string, delimiter: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    fields.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    if (fields.some(f => f.trim() !== '')) records.push({ line: recordLine, fields });
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line++;
        field += char;
      }
    } else if (char === '"' && field.trim() === '') {
      field = '';
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += char;
    }
  }
  if (field !== '' || fields.length > 0) endRecord();
  return records;
}

function isHeader(fields: string[]): boolean {
  const headers = fields.map(normalizeHeader);
  return headers.some(isDateHeader) && headers.some(isAmountHeader);
}

function isDateHeader(h: string): boolean {
  return ['buchungstag', 'buchungsdatum', 'buchung', 'datum'].includes(h);
}

// "Betrag", "Umsatz", "Betrag (EUR)", "Umsatz in Euro" – aber nicht "Umsatzart" oder "Saldo nach Buchung"
function isAmountHeader(h: string): boolean {
  return /^(betrag|umsatz)(in)?(eur|euro)?$/.test(h);
}

function mapColumns(headerFields: string[], rows: CsvRecord[]): ColumnMap {
  const headers = headerFields.map(normalizeHeader);
  const indexes = (predicate: (h: string) => boolean) => headers.flatMap((h, i) => (predicate(h) ? [i] : []));
  // Eigene Kontodaten stehen in jeder Zeile gleich ("IBAN Auftragskonto"), die des Zahlungsbeteiligten wechseln.
  // Bei mehreren Kandidaten gewinnt deshalb die Spalte mit den meisten unterschiedlichen Werten,
  // bei Gleichstand die in der Reihenfolge der Kandidaten zuerst genannte.
  const mostVaried = (candidates: number[]) =>
    candidates
      .map((i, priority) => ({ i, priority, distinct: new Set(rows.map(r => clean(r.fields[i]))).size }))
      .sort((a, b) => b.distinct - a.distinct || a.priority - b.priority)[0]?.i;

  const ownAccount = (h: string) => h.includes('auftragskonto') || h.includes('eigenes');
  // Älteres VR-Format: "Auftraggeber/Zahlungsempfänger" ist der eigene Kontoinhaber,
  // "Empfänger/Zahlungspflichtiger" der Zahlungsbeteiligte – darum steht Letzterer weiter vorn.
  const nameHeaders = [
    'namezahlungsbeteiligter',
    'zahlungsbeteiligter',
    'beguenstigterzahlungspflichtiger',
    'empfaengerzahlungspflichtiger',
    'zahlungspflichtigerempfaenger',
    'auftraggeberzahlungsempfaenger',
    'auftraggeberempfaenger',
    'gegenkontoinhaber',
    'auftraggeber',
    'empfaenger',
    'name'
  ];
  const byPriority = (list: string[], candidates: number[]) =>
    [...candidates].sort((a, b) => list.indexOf(headers[a]) - list.indexOf(headers[b]));

  const purpose = indexes(h => h.startsWith('verwendungszweck') || h === 'vorgangverwendungszweck');
  // Soll/Haben-Kennzeichen (älteres Format: Betrag ohne Vorzeichen, daneben "S" oder "H", Spaltenkopf oft leer)
  const debitCredit = headers.findIndex((h, i) => {
    const values = rows.map(r => clean(r.fields[i])).filter(Boolean);
    return ['sollhaben', 'sh', ''].includes(h) && values.length > 0 && values.every(v => /^[SH]$/i.test(v));
  });

  return {
    bookingDate: headers.findIndex(isDateHeader),
    amount: headers.findIndex(isAmountHeader),
    name: mostVaried(
      byPriority(
        nameHeaders,
        indexes(h => nameHeaders.includes(h) && !ownAccount(h))
      )
    ),
    iban: mostVaried(indexes(h => h.includes('iban') && !ownAccount(h))),
    purpose: purpose.length > 0 ? purpose : indexes(h => h === 'buchungstext' || h === 'vorgang'),
    debitCredit: debitCredit >= 0 ? debitCredit : undefined,
    currency: headers.findIndex(h => h === 'waehrung' || h === 'wahrung' || h === 'currency'),
    valueDate: headers.findIndex(h => ['valutadatum', 'valuta', 'wertstellung'].includes(h)),
    bookingText: headers.findIndex(h => ['buchungstext', 'umsatzart', 'vorgang'].includes(h)),
    balance: headers.findIndex(h => h === 'saldonachbuchung' || h === 'kontostand'),
    accountIban: headers.findIndex(h => h === 'ibanauftragskonto' || h === 'eigeneiban')
  };
}

function readTransactions(columns: ColumnMap, rows: CsvRecord[]): BankCsvResult {
  const transactions: BankTransaction[] = [];
  const skippedLines: number[] = [];
  const occurrences = new Map<string, number>();
  const field = (record: CsvRecord, index: number | undefined) =>
    index === undefined || index < 0 ? '' : clean(record.fields[index]);

  for (const record of rows) {
    if (record.fields.some(f => BALANCE_ROWS.has(normalizeHeader(f)))) continue;

    const bookingDate = parseDate(field(record, columns.bookingDate));
    let amountCents = parseAmount(field(record, columns.amount));
    if (!bookingDate || amountCents === null) {
      skippedLines.push(record.line);
      continue;
    }
    const indicator = field(record, columns.debitCredit).toUpperCase();
    if (indicator === 'S') amountCents = -Math.abs(amountCents);
    if (indicator === 'H') amountCents = Math.abs(amountCents);

    const balanceText = field(record, columns.balance);
    const transaction = {
      line: record.line,
      bookingDate,
      valueDate: parseDate(field(record, columns.valueDate)) ?? '',
      bookingText: field(record, columns.bookingText),
      balanceAfterCents: balanceText ? parseAmount(balanceText) : null,
      accountIban: field(record, columns.accountIban).replace(/\s/g, '').toUpperCase(),
      name: field(record, columns.name),
      iban: field(record, columns.iban).replace(/\s/g, '').toUpperCase(),
      purpose: columns.purpose
        .map(i => field(record, i))
        .filter(Boolean)
        .join(' '),
      amountCents,
      currency: field(record, columns.currency).toUpperCase() || 'EUR'
    };

    // Zwei völlig gleiche Umsätze am selben Tag (z. B. zweimal 10 € vom selben Konto) sind trotzdem
    // zwei Zahlungen: Sie werden durchgezählt. Auch in einem späteren, überlappenden Export
    // bekommen sie dadurch wieder dieselben Fingerabdrücke.
    const key = transactionKey(transaction);
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    const fingerprint = fingerprintOf(transaction, occurrence);

    transactions.push({ ...transaction, fingerprint });
  }

  return { transactions, skippedLines };
}
