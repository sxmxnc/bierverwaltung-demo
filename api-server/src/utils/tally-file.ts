/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { createHash } from 'node:crypto';

// Liest Export- und Zwischenstand-Dateien des Erfassungs-Tools für die Backup-Strichliste
// (format "strichlisten-erfassung", Version 1 und 2). Aufbau: docs/STRICHLISTEN-FORMAT.md.
// Es wird nur gelesen und geprüft – gebucht wird in routes/tally-import.ts.

export interface ToolDrink {
  key: string;
  name: string;
  price: number;
}

export interface ToolPerson {
  id: string; // ID im Tool (p1, p2 …), nur innerhalb einer Tool-Installation eindeutig
  gruppe: string;
  name: string;
  vorname: string;
  nachname: string;
  vo: string;
  kontoId: string; // ab Version 2: Konto in der App, sonst ''
}

export interface ToolListLine {
  personId: string;
  drinkKey: string;
  count: number;
  price: number;
}

export interface ToolList {
  key: string; // "uid:<uid>" oder (Version 1, ohne uid) "v1:<Inhalts-Prüfsumme>"
  uid: string | null;
  toolId: string;
  name: string;
  datum: string | null; // JJJJ-MM-TT
  monat: string | null; // JJJJ-MM
  notiz: string;
  lines: ToolListLine[]; // nur Zähler > 0
  contentHash: string;
  strokeCount: number;
  totalCents: number;
}

export interface TallyFile {
  version: number;
  typ: string;
  savedAt: string | null;
  drinks: ToolDrink[];
  persons: ToolPerson[];
  lists: ToolList[];
  warnings: string[];
}

export class TallyFileError extends Error {}

export const TALLY_FILE_FORMAT = 'strichlisten-erfassung';
const SUPPORTED_VERSIONS = [1, 2];
const MAX_COUNT = 999;
const MAX_PRICE = 50;

export function parseTallyFile(input: unknown): TallyFile {
  const file = asObject(input, 'Die Datei enthält kein JSON-Objekt.');
  if (file.format !== TALLY_FILE_FORMAT) {
    throw new TallyFileError(
      'Das ist keine Datei aus dem Erfassungs-Tool. Bitte „Export für die Bilanz (JSON)“ oder den Zwischenstand hochladen.'
    );
  }
  const version = Number(file.version);
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new TallyFileError(`Version ${String(file.version)} des Erfassungs-Tools wird noch nicht unterstützt.`);
  }

  const drinks = readDrinks(file.getraenke);
  const state = asObject(file.zwischenstand, 'In der Datei fehlt der Rohstand („zwischenstand“).');
  const persons = readPersons(state.persons);
  const personIds = new Set(persons.map(person => person.id));
  const warnings: string[] = [];

  const rawLists = Array.isArray(state.lists) ? state.lists : null;
  if (!rawLists) throw new TallyFileError('In der Datei fehlen die Listen.');
  const entries = isObject(state.entries) ? state.entries : {};

  const lists: ToolList[] = [];
  const seenKeys = new Set<string>();
  for (const [index, raw] of rawLists.entries()) {
    const list = asObject(raw, `Liste ${index + 1} ist ungültig.`);
    const toolId = text(list.id);
    if (!toolId) throw new TallyFileError(`Liste ${index + 1} hat keine ID.`);
    const name = text(list.name) || `Liste ${index + 1}`;
    const listEntries = isObject(entries[toolId]) ? (entries[toolId] as Record<string, unknown>) : {};

    const lines: ToolListLine[] = [];
    for (const [personId, rawCounts] of Object.entries(listEntries)) {
      if (!personIds.has(personId)) {
        throw new TallyFileError(`„${name}“ enthält Striche für eine unbekannte Person (${personId}).`);
      }
      if (!Array.isArray(rawCounts) || rawCounts.length > drinks.length) {
        throw new TallyFileError(`„${name}“: Die Striche einer Person passen nicht zur Getränkeliste.`);
      }
      rawCounts.forEach((value, drinkIndex) => {
        const count = value === null || value === '' ? 0 : Number(value);
        if (!Number.isInteger(count) || count < 0 || count > MAX_COUNT) {
          throw new TallyFileError(`„${name}“: ungültige Anzahl „${String(value)}“.`);
        }
        if (count > 0) {
          const drink = drinks[drinkIndex];
          lines.push({ personId, drinkKey: drink.key, count, price: drink.price });
        }
      });
    }

    const uid = version >= 2 ? text(list.uid) : '';
    if (version >= 2 && !uid) throw new TallyFileError(`„${name}“ hat keine uid (Version 2 verlangt eine).`);
    const contentHash = hashLines(lines);
    const key = uid ? `uid:${uid}` : `v1:${contentHash}`;
    if (seenKeys.has(key)) {
      if (uid) throw new TallyFileError(`Die uid von „${name}“ kommt in der Datei doppelt vor.`);
      // Version 1: Listen mit genau gleichem Inhalt lassen sich nicht unterscheiden (leere Listen sowieso)
      if (lines.length > 0) {
        warnings.push(`„${name}“ ist inhaltlich identisch mit einer anderen Liste der Datei und wird übersprungen.`);
      }
      continue;
    }
    seenKeys.add(key);

    lists.push({
      key,
      uid: uid || null,
      toolId,
      name,
      datum: isoDate(list.datum),
      monat: /^\d{4}-\d{2}$/.test(text(list.monat)) ? text(list.monat) : null,
      notiz: text(list.notiz),
      lines,
      contentHash,
      strokeCount: lines.reduce((sum, line) => sum + line.count, 0),
      totalCents: lines.reduce((sum, line) => sum + line.count * Math.round(line.price * 100), 0)
    });
  }

  checkExportTotals(file.listen, rawLists.length, lists, warnings);
  if (version < 2) {
    warnings.push(
      'Datei aus Version 1 des Erfassungs-Tools: Listen haben keine feste Kennung. Eine nachträglich geänderte Liste erscheint deshalb als neue Liste.'
    );
  }

  return {
    version,
    typ: text(file.typ) || 'export',
    savedAt: text(state.savedAt) || text(file.gespeichert) || null,
    drinks,
    persons,
    lists,
    warnings
  };
}

// Prüfsumme über den Inhalt einer Liste (Person im Tool, Getränk, Anzahl, Preis). Bleibt beim Wechsel
// von Version 1 auf 2 gleich, solange die Liste nicht geändert wird – so erkennt der Import Listen wieder,
// die als Version 1 schon importiert bzw. als "in der Bilanz" markiert wurden.
export function hashLines(lines: ToolListLine[]): string {
  const canonical = lines
    .map(line => `${line.personId}|${line.drinkKey}|${line.count}|${Math.round(line.price * 100)}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

// Für den Namensvergleich: klein, Umlaute ausgeschrieben, nur Buchstaben und Ziffern
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function readDrinks(value: unknown): ToolDrink[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TallyFileError('In der Datei fehlt die Getränkeliste („getraenke“).');
  }
  const keys = new Set<string>();
  return value.map((raw, index) => {
    const drink = asObject(raw, `Getränk ${index + 1} ist ungültig.`);
    const key = text(drink.key);
    const price = Number(drink.preis_eur);
    if (!key || keys.has(key)) throw new TallyFileError(`Getränk ${index + 1} hat keinen eindeutigen Schlüssel.`);
    if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
      throw new TallyFileError(`Getränk „${key}“ hat einen ungültigen Preis.`);
    }
    keys.add(key);
    return { key, name: text(drink.name) || key, price: Math.round(price * 100) / 100 };
  });
}

function readPersons(value: unknown): ToolPerson[] {
  if (!Array.isArray(value)) throw new TallyFileError('In der Datei fehlen die Personen.');
  const ids = new Set<string>();
  return value.map((raw, index) => {
    const person = asObject(raw, `Person ${index + 1} ist ungültig.`);
    const id = text(person.id);
    if (!id || ids.has(id)) throw new TallyFileError(`Person ${index + 1} hat keine eindeutige ID.`);
    ids.add(id);
    return {
      id,
      gruppe: text(person.gruppe),
      name: text(person.name),
      vorname: text(person.vorname),
      nachname: text(person.nachname),
      vo: text(person.vo),
      kontoId: text(person.konto_id)
    };
  });
}

// Im Export stehen je Liste die Summen, die das Tool selbst berechnet hat. Weichen sie vom Rohstand ab,
// ist die Datei beschädigt oder von Hand bearbeitet – dann lieber nicht importieren.
function checkExportTotals(value: unknown, rawCount: number, lists: ToolList[], warnings: string[]) {
  if (!Array.isArray(value)) return;
  if (value.length !== rawCount) {
    warnings.push('Die Listen-Übersicht im Export passt nicht zur Zahl der Listen – Summen nicht geprüft.');
    return;
  }
  const byUid = new Map(lists.filter(list => list.uid).map(list => [list.uid, list]));
  value.forEach((raw, index) => {
    if (!isObject(raw) || !isObject(raw.summe)) return;
    const list: ToolList | undefined =
      (raw.uid ? byUid.get(String(raw.uid)) : undefined) ?? lists.find(l => l.name === text(raw.name)) ?? lists[index];
    if (!list) return;
    const expected = Math.round(Number((raw.summe as Record<string, unknown>).betrag_eur) * 100);
    if (Number.isFinite(expected) && expected !== list.totalCents) {
      throw new TallyFileError(
        `Die Summe von „${list.name}“ im Export (${(expected / 100).toFixed(2)} €) passt nicht zu den Strichen (${(list.totalCents / 100).toFixed(2)} €). Bitte die Datei neu aus dem Tool exportieren.`
      );
    }
  });
}

function isoDate(value: unknown): string | null {
  const v = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === v ? v : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!isObject(value)) throw new TallyFileError(message);
  return value;
}
