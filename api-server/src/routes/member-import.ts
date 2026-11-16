/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/permissions.js';
import { Payment } from '../models/payment.js';
import { User } from '../models/user-auth.js';
import { CLUB } from '../club.js';
import { balancesByUser, round2 } from '../utils/account.js';
import { appCategory, MemberImportError, parseImportCsv, PlannedRow, planImport } from '../utils/member-import.js';
import { berlinMidnight } from '../utils/periods.js';
import { getSetting, setSetting } from '../utils/settings.js';
import { withBookingTransaction } from '../utils/transaction.js';
import { placeholderEmail } from './users.js';

// Mitglieder-Import aus der Excel-Bilanz (Prüfdatei von scripts/bilanz-export.ts):
// Vorschau → Übernehmen (alles oder nichts) → Abgleich der Summen. Je Konto genau ein Übertrag zum Stichtag.

export const TRANSFER_NOTE = 'Übertrag aus der Excel-Bilanz';

function todayBerlin(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
}

function checkCutoff(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > todayBerlin()) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value ? value : null;
}

// Übertrag gilt zum Ende des Stichtags (23:59:59 deutscher Zeit)
function cutoffTimestamp(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(berlinMidnight(y, m, d) + 24 * 60 * 60 * 1000 - 1000).toISOString();
}

const sumCents = (rows: PlannedRow[], sign: 1 | -1) =>
  rows.reduce((s, r) => s + (Math.sign(r.balanceCents) === sign ? r.balanceCents : 0), 0);

async function analyze(app: Express['locals'], csv: unknown) {
  if (typeof csv !== 'string' || !csv.trim()) throw new MemberImportError('Bitte die Prüfdatei (CSV) hochladen.');
  const { rows, errors, meta } = parseImportCsv(csv);
  const [users, payments]: [User[], Payment[]] = await Promise.all([app.userDao.findAll(), app.paymentDao.findAll()]);
  return { planned: planImport(rows, users, payments), errors, meta, users };
}

export function memberImportRoutes(app: Express) {
  const guard = [
    authMiddleware,
    requirePermission(PERMISSIONS.MANAGE_USERS),
    requirePermission(PERMISSIONS.MANAGE_FINANCE)
  ];

  app.post('/api/member-import/preview', ...guard, async (req, res) => {
    try {
      const { planned, errors, meta, users } = await analyze(req.app.locals, req.body?.csv);
      const names = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
      const active = planned.filter(r => r.action === 'anlegen' || r.action === 'zuordnen');
      res.json({
        meta,
        errors: [...errors, ...planned.filter(r => r.action === 'fehler').map(r => `Zeile ${r.line}: ${r.reason}`)],
        rows: planned.map(r => ({ ...r, targetName: r.targetId ? (names.get(r.targetId) ?? null) : null })),
        totals: {
          rows: planned.length,
          create: planned.filter(r => r.action === 'anlegen').length,
          link: planned.filter(r => r.action === 'zuordnen').length,
          skip: planned.filter(r => r.action === 'ueberspringen').length,
          done: planned.filter(r => r.action === 'schon_uebernommen').length,
          debt: sumCents(active, 1) / 100,
          credit: sumCents(active, -1) / 100
        },
        demoLogins: process.env.DEMO_LOGINS === 'true'
      });
    } catch (error) {
      if (error instanceof MemberImportError) return res.status(400).json({ error: error.message });
      console.error('Fehler bei der Vorschau des Mitglieder-Imports:', error);
      res.status(500).json({ error: 'Serverfehler beim Lesen der Datei' });
    }
  });

  app.post('/api/member-import/book', ...guard, async (req: AuthRequest, res) => {
    // Echte Mitgliederdaten nie zusammen mit den passwortlosen Demo-Zugängen des Prototyps
    if (process.env.NODE_ENV === 'production' && process.env.DEMO_LOGINS === 'true') {
      return res.status(409).json({
        error:
          'Die Demo-Zugänge ohne Passwort sind eingeschaltet (DEMO_LOGINS). Bitte erst abschalten, dann importieren.'
      });
    }
    const cutoff = checkCutoff(req.body?.stichtag);
    if (!cutoff)
      return res.status(400).json({ error: 'Bitte einen gültigen Stichtag angeben (nicht in der Zukunft).' });
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.slice(0, 200) : '';

    try {
      const { planned, errors, meta } = await analyze(req.app.locals, req.body?.csv);
      const failed = planned.filter(r => r.action === 'fehler');
      if (errors.length || failed.length) {
        return res.status(400).json({
          error: [...errors, ...failed.map(r => `Zeile ${r.line}: ${r.reason}`)].join('\n')
        });
      }
      const todo = planned.filter(r => r.action === 'anlegen' || r.action === 'zuordnen');
      if (todo.length === 0)
        return res
          .status(400)
          .json({ error: 'Nichts zu übernehmen – alle Zeilen sind schon übernommen oder übersprungen.' });

      const actorId = req.user!.id;
      const date = cutoffTimestamp(cutoff);
      const origin = meta || fileName || 'Prüfdatei';
      const result = await withBookingTransaction(req.app, async daos => {
        const ids: string[] = [];
        for (const row of todo) {
          let userId = row.targetId;
          const isAccount = row.category === 'kasse' || row.category === 'verein';
          if (row.action === 'anlegen') {
            const created = await daos.userDao.create({
              firstName: (isAccount ? row.lastName : row.firstName) || row.lastName,
              lastName: isAccount ? '' : row.firstName ? row.lastName : '',
              nickname: row.nickname || null,
              email: row.email || placeholderEmail(),
              password: '',
              residence: '',
              role: isAccount ? 'kasse' : 'user',
              status: row.status === 'inaktiv' ? 'inactive' : 'active',
              category: appCategory(row.category),
              sepaMandate: {
                creditorName: CLUB.creditorName,
                creditorId: CLUB.creditorId,
                debtorName: `${row.firstName} ${row.lastName}`.trim(),
                debtorBank: '',
                iban: ''
              }
            });
            userId = created.id;
          } else {
            const existing = (await daos.userDao.findOne({ id: userId! }))!;
            if (!existing.category) await daos.userDao.update({ id: existing.id, category: appCategory(row.category) });
          }
          await daos.paymentDao.create({
            userId: userId!,
            amount: -row.balanceCents / 100,
            note: TRANSFER_NOTE,
            date,
            createdByAdminId: actorId,
            kind: 'uebertrag',
            source: `${origin} · ${row.source}`
          });
          ids.push(userId!);
        }
        return ids;
      });

      // Stichtag merken: Bankbuchungen bis dahin stecken im Übertrag (Bank-Journal)
      const previous = await getSetting(req.app, 'import:stichtag');
      if (!previous || cutoff > previous) await setSetting(req.app, 'import:stichtag', cutoff);

      // Abgleich: Kontostände der übernommenen Konten aus dem Übertrag (ohne spätere Buchungen)
      const payments: Payment[] = await req.app.locals.paymentDao.findAll();
      const transfers = balancesByUser(
        [],
        payments.filter(p => p.kind === 'uebertrag' && result.includes(p.userId))
      );
      const appDebt = -[...transfers.values()].filter(v => v < 0).reduce((s, v) => s + v, 0);
      const appCredit = [...transfers.values()].filter(v => v > 0).reduce((s, v) => s + v, 0);
      res.status(201).json({
        created: todo.filter(r => r.action === 'anlegen').length,
        linked: todo.filter(r => r.action === 'zuordnen').length,
        check: {
          fileDebt: sumCents(todo, 1) / 100,
          fileCredit: sumCents(todo, -1) / 100,
          appDebt: round2(appDebt),
          appCredit: round2(appCredit)
        }
      });
    } catch (error) {
      if (error instanceof MemberImportError) return res.status(400).json({ error: error.message });
      if ((error as { code?: string }).code === '23505') {
        return res
          .status(409)
          .json({ error: 'Ein Konto oder Übertrag gibt es schon (E-Mail doppelt?). Es wurde nichts übernommen.' });
      }
      console.error('Fehler beim Mitglieder-Import:', error);
      res.status(500).json({ error: 'Serverfehler beim Übernehmen – es wurde nichts übernommen.' });
    }
  });
}
