/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { BankCategory, BankIban, BankTransactionRecord } from '../models/bank.js';
import { User } from '../models/user-auth.js';
import { normalizeName } from './tally-file.js';

// Bank-Journal: Saldenkette prüfen (fehlt ein Export dazwischen?) und Zuordnungen vorschlagen.

export interface ChainGap {
  afterDate: string | null; // letzte lückenlose Buchung
  beforeDate: string; // erste Buchung nach der Lücke
  expectedCents: number; // Kontostand, an dem es weitergehen müsste
  foundCents: number; // Kontostand vor der Buchung nach der Lücke
}

export interface ChainResult {
  ok: boolean;
  checked: number; // Buchungen mit Saldo
  firstDate: string | null;
  lastDate: string | null;
  lastBalanceCents: number | null;
  gaps: ChainGap[];
}

type ChainEntry = Pick<BankTransactionRecord, 'bookingDate' | 'amount' | 'balanceAfter'>;

const cents = (euro: number | string) => Math.round(Number(euro) * 100);

// Je Buchung gilt: Saldo vorher + Betrag = Saldo nachher. Innerhalb eines Tages ist die Reihenfolge der Bank
// unbekannt, deshalb wird sie über die Kette selbst gefunden.
export function checkChain(entries: ChainEntry[]): ChainResult {
  const withBalance = entries.filter(e => e.balanceAfter !== null && e.balanceAfter !== undefined);
  const days = [...new Set(withBalance.map(e => e.bookingDate))].sort();
  const gaps: ChainGap[] = [];
  let balance: number | null = null;
  let lastDate: string | null = null;

  for (const day of days) {
    const pending = withBalance.filter(e => e.bookingDate === day);
    while (pending.length) {
      let index = balance === null ? -1 : pending.findIndex(e => balance! + cents(e.amount) === cents(e.balanceAfter!));
      if (index < 0) {
        // Einstieg (erste Buchung) oder Lücke: mit der Buchung weitermachen, die am Tag niemand fortsetzt
        const starts = pending.filter(
          e => !pending.some(o => o !== e && cents(o.balanceAfter!) + cents(e.amount) === cents(e.balanceAfter!))
        );
        const start = starts[0] ?? pending[0];
        index = pending.indexOf(start);
        if (balance !== null) {
          gaps.push({
            afterDate: lastDate,
            beforeDate: day,
            expectedCents: balance,
            foundCents: cents(start.balanceAfter!) - cents(start.amount)
          });
        }
      }
      const [entry] = pending.splice(index, 1);
      balance = cents(entry.balanceAfter!);
      lastDate = day;
    }
  }
  return {
    ok: gaps.length === 0,
    checked: withBalance.length,
    firstDate: days[0] ?? null,
    lastDate,
    lastBalanceCents: balance,
    gaps
  };
}

export interface Suggestion {
  userId: string | null;
  category: BankCategory | null;
  confidence: 'sicher' | 'vorschlag' | 'keine';
  reason: string;
  askAlways: boolean; // IBAN zahlt für mehrere – nie automatisch
}

const INVOICE = /\b\d{6}-\d{2}\b/; // Rechnungszeichen der Bierkasse, z. B. 112026-03
// Wörter für den Namensvergleich ("Jan-Frederic" → jan, frederic; Umlaute vereinheitlicht)
const tokens = (v: string) =>
  v
    .toLowerCase()
    .split(/[^a-zäöüßéèàç0-9]+/)
    .map(normalizeName)
    .filter(t => t.length > 1);

export function suggest(
  tx: Pick<BankTransactionRecord, 'amount' | 'name' | 'iban' | 'purpose'>,
  accounts: User[],
  ibans: BankIban[],
  balances: Map<string, number>
): Suggestion {
  const none = (reason: string, askAlways = false): Suggestion => ({
    userId: null,
    category: null,
    confidence: 'keine',
    reason,
    askAlways
  });
  const amountCents = cents(tx.amount);
  const text = `${tx.name} ${tx.purpose}`;
  const known = tx.iban ? ibans.find(i => i.iban === tx.iban) : undefined;

  if (INVOICE.test(tx.purpose)) {
    return {
      userId: null,
      category: 'rechnung',
      confidence: 'vorschlag',
      reason: `Rechnung ${INVOICE.exec(tx.purpose)![0]}`,
      askAlways: false
    };
  }
  if (amountCents < 0) {
    if (/roth/i.test(text))
      return { userId: null, category: 'roth', confidence: 'vorschlag', reason: 'Getränke Roth', askAlways: false };
    if (/sauerlandia/i.test(tx.name))
      return {
        userId: null,
        category: 'intern',
        confidence: 'vorschlag',
        reason: 'an die Aktivitas',
        askAlways: false
      };
    return none('Ausgang');
  }
  if (known?.askAlways) return none('IBAN zahlt für mehrere Konten – bitte aufteilen', true);
  if (known?.userId && accounts.some(a => a.id === known.userId)) {
    return { userId: known.userId, category: null, confidence: 'sicher', reason: 'bekannte IBAN', askAlways: false };
  }
  if (/sauerlandia/i.test(tx.name)) return none('von der Aktivitas – bitte aufteilen', true);

  const haystack = new Set(tokens(text));
  const owes = (a: User) => Math.round(-(balances.get(a.id) ?? 0) * 100) === amountCents;
  const people = accounts.filter(a => a.role !== 'kasse' && a.lastName);
  const byName = people.filter(
    a => tokens(a.lastName).every(t => haystack.has(t)) && tokens(a.firstName).some(t => haystack.has(t))
  );
  if (byName.length === 1) {
    return owes(byName[0])
      ? {
          userId: byName[0].id,
          category: null,
          confidence: 'sicher',
          reason: 'Name und offener Betrag',
          askAlways: false
        }
      : { userId: byName[0].id, category: null, confidence: 'vorschlag', reason: 'Name passt', askAlways: false };
  }
  const nick = people.filter(
    a => a.nickname && tokens(a.nickname).length && tokens(a.nickname).every(t => haystack.has(t))
  );
  if (byName.length === 0 && nick.length === 1) {
    return {
      userId: nick[0].id,
      category: null,
      confidence: 'vorschlag',
      reason: 'V/o im Verwendungszweck',
      askAlways: false
    };
  }
  const byLast = (byName.length > 1 ? byName : people).filter(a => tokens(a.lastName).every(t => haystack.has(t)));
  const exact = byLast.filter(owes);
  if (exact.length === 1) {
    return {
      userId: exact[0].id,
      category: null,
      confidence: 'vorschlag',
      reason: 'Nachname und offener Betrag',
      askAlways: false
    };
  }
  if (byLast.length === 1) {
    return { userId: byLast[0].id, category: null, confidence: 'vorschlag', reason: 'nur Nachname', askAlways: false };
  }
  return none(byLast.length > 1 ? 'Name passt auf mehrere Konten' : 'kein passendes Konto');
}
