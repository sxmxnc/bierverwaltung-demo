/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Drink } from '../models/drink.js';
import { TallyImport } from '../models/tally-import.js';
import { User } from '../models/user-auth.js';
import { displayName, TALLY_TARGET_ROLES } from './members.js';
import { normalizeName, ToolList, ToolPerson } from './tally-file.js';

// Zuordnung von Personen und Getränken aus dem Erfassungs-Tool zu Konten und Getränken der App.

// Getränke-Schlüssel des Tools → Getränk der App. Erst über die feste ID (Datenbank aus init.sql),
// sonst über Name und Einheit (z. B. In-Memory-Datenbank oder nachträglich angelegte Getränke).
// "weizen" steht auf der Papierliste für Weizen und Weizen alkoholfrei und wird als Weizen gebucht.
export const TOOL_DRINKS: Record<string, { id: string; name: string; unit: string }> = {
  bit02: { id: 'drink-bitburger-02', name: 'Bitburger', unit: '0,2 l' },
  bit03: { id: 'drink-bitburger-03', name: 'Bitburger', unit: '0,3 l' },
  bit05: { id: 'drink-bitburger-05', name: 'Bitburger', unit: '0,5 l' },
  weizen: { id: 'drink-weizen', name: 'Weizen', unit: '0,5 l' },
  bitfl_af: { id: 'drink-bitburger-alkoholfrei', name: 'Bitburger alkoholfrei', unit: '0,33 l' },
  helles: { id: 'drink-helles', name: 'Helles', unit: '0,5 l' },
  sd02: { id: 'drink-softdrink-02', name: 'Softdrink', unit: '0,2 l' },
  sd03: { id: 'drink-softdrink-03', name: 'Softdrink', unit: '0,3 l' },
  sd05: { id: 'drink-softdrink-05', name: 'Softdrink', unit: '0,5 l' },
  sd_fl: { id: 'drink-softdrink-flasche', name: 'Softdrink Flasche', unit: '1,0 l' },
  wasser: { id: 'drink-wasser-flasche', name: 'Wasser Flasche', unit: '1,0 l' }
};

export function mapDrinks(keys: string[], drinks: Drink[]): { map: Map<string, Drink>; missing: string[] } {
  const map = new Map<string, Drink>();
  const missing: string[] = [];
  const key = (name: string, unit: string) => `${normalizeName(name)}|${normalizeName(unit)}`;
  const byNameUnit = new Map(drinks.map(drink => [key(drink.name, drink.unit), drink]));
  for (const toolKey of keys) {
    const target = TOOL_DRINKS[toolKey];
    const drink = target && (drinks.find(d => d.id === target.id) ?? byNameUnit.get(key(target.name, target.unit)));
    if (drink) map.set(toolKey, drink);
    else missing.push(toolKey);
  }
  return { map, missing };
}

export type PersonConfidence = 'sicher' | 'vorschlag' | 'offen';

export interface PersonMatch {
  userId: string | null;
  confidence: PersonConfidence;
  reason: string;
}

// Merkschlüssel für eine Person ohne konto_id (Version 1): Name, wie er im Tool steht
export function aliasKey(person: Pick<ToolPerson, 'vorname' | 'nachname' | 'vo' | 'name'>): string {
  return [person.vorname, person.nachname, person.vo, person.name].map(normalizeName).join('|');
}

export function tallyTargets(users: User[]): User[] {
  return users.filter(user => user.status === 'active' && TALLY_TARGET_ROLES.includes(user.role));
}

// Vorname aus dem Tool passt zum Vornamen des Kontos? "Jan-Freder." gilt als Abkürzung von "Jan Frederic",
// "Max" passt zu "Max", aber nicht zu "Maximilian" (zu unsicher).
function firstNameMatches(toolFirst: string, accountFirst: string): boolean {
  const tool = normalizeName(toolFirst);
  const account = normalizeName(accountFirst);
  if (!tool || !account) return false;
  if (tool === account) return true;
  return toolFirst.trim().endsWith('.') && tool.length >= 3 && account.startsWith(tool);
}

// Kassen stehen im Tool als Vorname = Amt (Quaestor), Nachname = Kasse (Aktivenkasse)
function accountNames(user: User): { first: string; last: string; vo: string } {
  if (user.role === 'kasse') return { first: user.nickname ?? '', last: user.firstName, vo: '' };
  return { first: user.firstName, last: user.lastName, vo: user.nickname ?? '' };
}

export function matchPerson(person: ToolPerson, accounts: User[], aliases: Map<string, string>): PersonMatch {
  const active = new Map(accounts.map(account => [account.id, account]));

  if (person.kontoId) {
    if (active.has(person.kontoId))
      return { userId: person.kontoId, confidence: 'sicher', reason: 'Konto aus dem Tool' };
  }
  const alias = aliases.get(aliasKey(person));
  if (alias && active.has(alias)) return { userId: alias, confidence: 'sicher', reason: 'gemerkte Zuordnung' };

  const last = normalizeName(person.nachname || person.name);
  const byName = accounts.filter(account => {
    const names = accountNames(account);
    return normalizeName(names.last) === last && firstNameMatches(person.vorname, names.first);
  });
  if (byName.length === 1) return { userId: byName[0].id, confidence: 'vorschlag', reason: 'Vor- und Nachname' };

  const vo = normalizeName(person.vo);
  if (vo) {
    const byVo = accounts.filter(account => normalizeName(accountNames(account).vo) === vo);
    if (byVo.length === 1) return { userId: byVo[0].id, confidence: 'vorschlag', reason: 'V/o' };
  }

  const byLastName = accounts.filter(account => last && normalizeName(accountNames(account).last) === last);
  if (byLastName.length === 1) return { userId: byLastName[0].id, confidence: 'vorschlag', reason: 'nur Nachname' };

  const reason = person.kontoId
    ? 'Konto aus dem Tool gibt es nicht (mehr)'
    : byName.length + byLastName.length > 1
      ? 'mehrere Konten passen'
      : 'kein passendes Konto';
  return { userId: null, confidence: 'offen', reason };
}

export type ListStatus = 'neu' | 'geaendert' | 'importiert' | 'bilanz' | 'leer';
export type ListAction = 'buchen' | 'ersetzen' | 'bilanz' | 'ueberspringen';

export interface ListState {
  status: ListStatus;
  previous: TallyImport | null; // aktiver Import derselben Liste bzw. mit gleichem Inhalt
  actions: ListAction[];
  defaultAction: ListAction;
}

// Was ist mit einer Liste aus der Datei zu tun? active = Importe mit Status gebucht oder bilanz.
export function listState(list: ToolList, active: TallyImport[]): ListState {
  const sameKey = active.find(entry => entry.listKey === list.key) ?? null;
  const sameContent = active.find(entry => entry.contentHash === list.contentHash) ?? null;

  if (sameKey && sameKey.contentHash === list.contentHash) return done(sameKey);
  if (list.lines.length === 0 && !sameKey) {
    return { status: 'leer', previous: null, actions: ['ueberspringen'], defaultAction: 'ueberspringen' };
  }
  if (sameKey) {
    return {
      status: 'geaendert',
      previous: sameKey,
      actions: ['ersetzen', 'ueberspringen'],
      defaultAction: 'ersetzen'
    };
  }
  // z. B. Liste als Version 1 importiert, jetzt mit uid aus Version 2 – Inhalt unverändert
  if (sameContent) return done(sameContent);
  return { status: 'neu', previous: null, actions: ['buchen', 'bilanz', 'ueberspringen'], defaultAction: 'buchen' };

  function done(previous: TallyImport): ListState {
    return {
      status: previous.status === 'bilanz' ? 'bilanz' : 'importiert',
      previous,
      actions: ['ueberspringen'],
      defaultAction: 'ueberspringen'
    };
  }
}

export function personLabel(person: ToolPerson): string {
  const full = `${person.vorname} ${person.nachname}`.trim() || person.name || person.id;
  return person.vo ? `${full} (${person.vo})` : full;
}

export function accountOption(user: User) {
  return {
    id: user.id,
    name: displayName(user),
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    role: user.role
  };
}
