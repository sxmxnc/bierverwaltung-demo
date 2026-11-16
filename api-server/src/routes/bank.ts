/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { createHash } from 'node:crypto';
import { Express } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/permissions.js';
import { BANK_CATEGORIES, BankCategory, BankIban, BankImport, BankTransactionRecord } from '../models/bank.js';
import { Order } from '../models/order.js';
import { Payment } from '../models/payment.js';
import { User } from '../models/user-auth.js';
import { balancesByUser, round2 } from '../utils/account.js';
import { BankCsvError, parseBankCsv } from '../utils/bank-csv.js';
import { checkChain, ChainResult, suggest } from '../utils/bank-journal.js';
import { displayName } from '../utils/members.js';
import { berlinMidnight } from '../utils/periods.js';
import { getSetting, setSetting } from '../utils/settings.js';
import { withBookingTransaction } from '../utils/transaction.js';

// Bank-Journal (docs/PLAN-IMPORT.md, Abschnitt 4): Der Bierwart lädt regelmäßig den CSV-Export der Umsätze hoch.
// Jede Buchung landet genau einmal im Journal (überlappende Exporte sind egal), Lücken zeigt die Saldenkette.
// Erst das Zuordnen erzeugt Zahlungen auf Personenkonten. Buchungen bis zum Stichtag stecken im Übertrag.

const MAX_SPLITS = 20;

const cents = (euro: number | string) => Math.round(Number(euro) * 100);

function noonBerlin(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(berlinMidnight(y, m, d) + 12 * 60 * 60 * 1000).toISOString();
}

function chainWarnings(chain: ChainResult): string[] {
  const de = (d: string | null) => (d ? d.split('-').reverse().join('.') : '–');
  return chain.gaps.map(
    gap =>
      `Lücke zwischen ${de(gap.afterDate)} und ${de(gap.beforeDate)}: Kontostand ${(gap.expectedCents / 100).toFixed(2)} € passt nicht zu ${(gap.foundCents / 100).toFixed(2)} €. Bitte einen Export ab ${de(gap.afterDate)} hochladen.`
  );
}

export function bankRoutes(app: Express) {
  const guard = [authMiddleware, requirePermission(PERMISSIONS.MANAGE_FINANCE)];

  app.post('/api/bank/upload', ...guard, async (req: AuthRequest, res) => {
    const csv = req.body?.csv;
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.slice(0, 200) : '';
    if (typeof csv !== 'string' || !csv.trim())
      return res.status(400).json({ error: 'Bitte eine CSV-Datei hochladen.' });
    try {
      const cutoff = await getSetting(req.app, 'import:stichtag');
      if (!cutoff) {
        return res.status(409).json({
          error: 'Noch kein Stichtag: Bitte zuerst die Mitglieder aus der Excel-Bilanz importieren.'
        });
      }
      const { transactions, skippedLines } = parseBankCsv(csv);
      if (transactions.length === 0) return res.status(400).json({ error: 'In der Datei stehen keine Umsätze.' });

      const accounts = [...new Set(transactions.map(t => t.accountIban).filter(Boolean))];
      if (accounts.length > 1) return res.status(400).json({ error: 'Die Datei enthält Umsätze mehrerer Konten.' });
      const expected = await getSetting(req.app, 'bank:accountIban');
      if (expected && accounts[0] && accounts[0] !== expected) {
        return res.status(400).json({
          error: `Das ist der Export eines anderen Kontos (…${accounts[0].slice(-4)}). Erwartet wird das Bierkassen-Konto …${expected.slice(-4)}.`
        });
      }

      const fileHash = createHash('sha256').update(csv).digest('hex');
      const actorId = req.user!.id;
      const result = await withBookingTransaction(req.app, async daos => {
        const existing = new Set((await daos.bankTransactionDao.findAll()).map(t => t.fingerprint));
        const fresh = transactions.filter(t => !existing.has(t.fingerprint));
        const dates = transactions.map(t => t.bookingDate).sort();
        const record = await daos.bankImportDao.create({
          fileName,
          fileHash,
          importedById: actorId,
          firstDate: dates[0],
          lastDate: dates[dates.length - 1],
          rows: transactions.length,
          added: fresh.length,
          known: transactions.length - fresh.length,
          warnings: []
        });
        for (const t of fresh) {
          await daos.bankTransactionDao.create({
            fingerprint: t.fingerprint,
            accountIban: t.accountIban,
            bookingDate: t.bookingDate,
            valueDate: t.valueDate,
            name: t.name,
            iban: t.iban,
            bookingText: t.bookingText,
            purpose: t.purpose,
            amount: t.amountCents / 100,
            balanceAfter: t.balanceAfterCents === null ? null : t.balanceAfterCents / 100,
            status: t.bookingDate <= cutoff ? 'vor_stichtag' : 'offen',
            category: null,
            note: '',
            importId: record.id,
            decidedById: null,
            decidedAt: null
          });
        }
        const chain = checkChain(await daos.bankTransactionDao.findAll());
        const warnings = [
          ...chainWarnings(chain),
          ...(skippedLines.length ? [`Nicht lesbare Zeilen: ${skippedLines.join(', ')}`] : [])
        ];
        await daos.bankImportDao.update({ id: record.id, warnings });
        return { added: fresh.length, known: transactions.length - fresh.length, chain, warnings, dates };
      });
      if (!expected && accounts[0]) await setSetting(req.app, 'bank:accountIban', accounts[0]);

      res.status(201).json({
        added: result.added,
        known: result.known,
        firstDate: result.dates[0],
        lastDate: result.dates[result.dates.length - 1],
        open: (await req.app.locals.bankTransactionDao.findAll({ status: 'offen' })).length,
        warnings: result.warnings,
        lastBalance: result.chain.lastBalanceCents === null ? null : result.chain.lastBalanceCents / 100
      });
    } catch (error) {
      if (error instanceof BankCsvError) return res.status(400).json({ error: error.message });
      console.error('Fehler beim Bank-Import:', error);
      res.status(500).json({ error: 'Serverfehler beim Lesen der Umsätze – es wurde nichts übernommen.' });
    }
  });

  // Journal: offene Buchungen mit Vorschlag, auf Wunsch alle
  app.get('/api/bank/journal', ...guard, async (req, res) => {
    try {
      const [records, users, orders, payments, ibans, imports]: [
        BankTransactionRecord[],
        User[],
        Order[],
        Payment[],
        BankIban[],
        BankImport[]
      ] = await Promise.all([
        req.app.locals.bankTransactionDao.findAll(),
        req.app.locals.userDao.findAll(),
        req.app.locals.orderDao.findAll(),
        req.app.locals.paymentDao.findAll(),
        req.app.locals.bankIbanDao.findAll(),
        req.app.locals.bankImportDao.findAll()
      ]);
      const view = req.query.view === 'alle' ? 'alle' : 'offen';
      const accounts = users.filter(u => u.role !== 'theke' && u.status !== 'pending');
      const balances = balancesByUser(orders, payments);
      const names = new Map(users.map(u => [u.id, displayName(u)]));
      const byTx = new Map<string, Payment[]>();
      for (const p of payments.filter(p => p.bankTransactionId)) {
        byTx.set(p.bankTransactionId!, [...(byTx.get(p.bankTransactionId!) ?? []), p]);
      }
      const chain = checkChain(records);
      const shown = records
        .filter(t => view === 'alle' || t.status === 'offen')
        .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || Number(b.amount) - Number(a.amount));

      res.json({
        stichtag: await getSetting(req.app, 'import:stichtag'),
        accountIban: await getSetting(req.app, 'bank:accountIban'),
        counts: {
          offen: records.filter(t => t.status === 'offen').length,
          zugeordnet: records.filter(t => t.status === 'zugeordnet').length,
          ignoriert: records.filter(t => t.status === 'ignoriert').length,
          vor_stichtag: records.filter(t => t.status === 'vor_stichtag').length
        },
        chain: {
          ok: chain.ok,
          lastDate: chain.lastDate,
          lastBalance: chain.lastBalanceCents === null ? null : chain.lastBalanceCents / 100,
          warnings: chainWarnings(chain)
        },
        lastImport: imports.sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] ?? null,
        transactions: shown.map(t => ({
          id: t.id,
          bookingDate: t.bookingDate,
          name: t.name,
          iban: t.iban,
          bookingText: t.bookingText,
          purpose: t.purpose,
          amount: round2(Number(t.amount)),
          status: t.status,
          category: t.category,
          note: t.note,
          allocations: (byTx.get(t.id) ?? []).map(p => ({
            userId: p.userId,
            name: names.get(p.userId) ?? 'Unbekannt',
            amount: round2(Number(p.amount))
          })),
          suggestion: t.status === 'offen' ? suggest(t, accounts, ibans, balances) : null
        })),
        accounts: accounts
          .map(u => ({
            id: u.id,
            name: displayName(u),
            fullName: `${u.firstName} ${u.lastName}`.trim(),
            balance: round2(balances.get(u.id) ?? 0)
          }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName, 'de'))
      });
    } catch (error) {
      console.error('Fehler beim Laden des Bank-Journals:', error);
      res.status(500).json({ error: 'Serverfehler' });
    }
  });

  // Zuordnen: auf ein oder mehrere Konten verteilen, Rest mit Zweck (z. B. Rechnung)
  app.post('/api/bank/transactions/:id/assign', ...guard, async (req: AuthRequest, res) => {
    const id = String(req.params.id);
    const raw: unknown = req.body?.allocations;
    const category: BankCategory | null = BANK_CATEGORIES.includes(req.body?.category) ? req.body.category : null;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 200) : '';
    const allocations = Array.isArray(raw)
      ? raw.map(a => ({ userId: String(a?.userId ?? ''), amount: Number(a?.amount) }))
      : [];
    try {
      const tx: BankTransactionRecord | null = await req.app.locals.bankTransactionDao.findOne({ id });
      if (!tx || tx.status !== 'offen')
        return res.status(404).json({ error: 'Buchung nicht gefunden oder schon erledigt' });
      if (allocations.length > MAX_SPLITS) return res.status(400).json({ error: `Höchstens ${MAX_SPLITS} Teile` });

      const users: User[] = await req.app.locals.userDao.findAll();
      const valid = new Set(users.filter(u => u.role !== 'theke').map(u => u.id));
      const sign = Math.sign(Number(tx.amount));
      for (const a of allocations) {
        if (!valid.has(a.userId)) return res.status(400).json({ error: 'Konto nicht gefunden' });
        if (!Number.isFinite(a.amount) || cents(a.amount) === 0 || Math.sign(a.amount) !== sign) {
          return res.status(400).json({ error: 'Jeder Teil braucht einen Betrag mit dem Vorzeichen der Buchung' });
        }
      }
      const rest = cents(tx.amount) - allocations.reduce((s, a) => s + cents(a.amount), 0);
      if (rest !== 0 && Math.sign(rest) !== sign)
        return res.status(400).json({ error: 'Die Teile sind zusammen größer als die Buchung' });
      if (rest !== 0 && !category) {
        return res.status(400).json({
          error: `Es bleiben ${(rest / 100).toFixed(2)} € ohne Konto – bitte einen Zweck (z. B. Rechnung) wählen oder aufteilen.`
        });
      }
      if (allocations.length === 0 && !category)
        return res.status(400).json({ error: 'Bitte ein Konto oder einen Zweck wählen' });

      const actorId = req.user!.id;
      await withBookingTransaction(req.app, async daos => {
        for (const a of allocations) {
          await daos.paymentDao.create({
            userId: a.userId,
            amount: round2(a.amount),
            note: a.amount > 0 ? 'Einzahlung (Überweisung)' : 'Auszahlung (Überweisung)',
            date: noonBerlin(tx.bookingDate),
            createdByAdminId: actorId,
            kind: null,
            source: `Bank ${tx.bookingDate} · ${tx.name}`.slice(0, 200),
            bankTransactionId: tx.id
          });
        }
        await daos.bankTransactionDao.update({
          id: tx.id,
          status: 'zugeordnet',
          category: rest !== 0 ? category : null,
          note,
          decidedById: actorId,
          decidedAt: Date.now()
        });
        // IBAN merken: zahlt sie nur für ein Konto, passt die Zuordnung künftig automatisch
        if (tx.iban && allocations.length > 0) {
          const known = await daos.bankIbanDao.findOne({ iban: tx.iban });
          const single = allocations.length === 1 && rest === 0;
          if (!known) {
            await daos.bankIbanDao.create({
              iban: tx.iban,
              userId: single ? allocations[0].userId : null,
              askAlways: !single
            });
          } else if (!known.askAlways && (!single || known.userId !== allocations[0].userId)) {
            await daos.bankIbanDao.update({ id: known.id, askAlways: true });
          }
        }
      });
      res.json({ ok: true });
    } catch (error) {
      console.error(`Fehler beim Zuordnen der Bankbuchung ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler beim Zuordnen – es wurde nichts gebucht.' });
    }
  });

  // Nicht für Personenkonten (Roth, Weiterleitung, Spende …)
  app.post('/api/bank/transactions/:id/ignore', ...guard, async (req: AuthRequest, res) => {
    const id = String(req.params.id);
    const category: BankCategory | null = BANK_CATEGORIES.includes(req.body?.category) ? req.body.category : null;
    if (!category) return res.status(400).json({ error: 'Bitte einen Zweck wählen' });
    try {
      const tx: BankTransactionRecord | null = await req.app.locals.bankTransactionDao.findOne({ id });
      if (!tx || tx.status !== 'offen')
        return res.status(404).json({ error: 'Buchung nicht gefunden oder schon erledigt' });
      await req.app.locals.bankTransactionDao.update({
        id,
        status: 'ignoriert',
        category,
        note: typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 200) : '',
        decidedById: req.user!.id,
        decidedAt: Date.now()
      });
      res.json({ ok: true });
    } catch (error) {
      console.error(`Fehler beim Erledigen der Bankbuchung ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler' });
    }
  });

  // Entscheidung zurücknehmen: Zahlungen dieser Buchung löschen, wieder offen
  app.post('/api/bank/transactions/:id/reopen', ...guard, async (req, res) => {
    const id = String(req.params.id);
    try {
      const tx: BankTransactionRecord | null = await req.app.locals.bankTransactionDao.findOne({ id });
      if (!tx || !['zugeordnet', 'ignoriert'].includes(tx.status)) {
        return res.status(404).json({ error: 'Nur zugeordnete oder erledigte Buchungen lassen sich zurücknehmen' });
      }
      await withBookingTransaction(req.app, async daos => {
        await daos.paymentDao.deleteAll({ bankTransactionId: id });
        await daos.bankTransactionDao.update({
          id,
          status: 'offen',
          category: null,
          note: '',
          decidedById: null,
          decidedAt: null
        });
      });
      res.json({ ok: true });
    } catch (error) {
      console.error(`Fehler beim Zurücknehmen der Bankbuchung ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler' });
    }
  });
}
