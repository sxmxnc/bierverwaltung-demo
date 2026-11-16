/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Application, Express } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/permissions.js';
import { Drink } from '../models/drink.js';
import { TallyAlias, TallyImport, TallyImportLine } from '../models/tally-import.js';
import { User } from '../models/user-auth.js';
import { round2 } from '../utils/account.js';
import { displayName } from '../utils/members.js';
import { berlinMidnight } from '../utils/periods.js';
import { parseTallyFile, TallyFile, TallyFileError, ToolList } from '../utils/tally-file.js';
import {
  accountOption,
  aliasKey,
  ListAction,
  listState,
  ListState,
  mapDrinks,
  matchPerson,
  PersonMatch,
  personLabel,
  tallyTargets
} from '../utils/tally-matching.js';
import { BookingDaos, withBookingTransaction } from '../utils/transaction.js';
import { adjustStock } from './order.js';

// Import der Backup-Strichliste aus dem Erfassungs-Tool (docs/STRICHLISTEN-FORMAT.md):
// 1. Vorschau: Datei prüfen, Listen wiedererkennen, Personen und Getränke zuordnen – es wird nichts gebucht.
// 2. Buchen: Die Datei wird erneut geprüft (der Vorschau wird nicht blind vertraut), dann alles in einer Transaktion.
// Importierte Striche zählen nicht in die Rangliste (orders.source = 'strichliste').

const ACTIVE = ['gebucht', 'bilanz'];
const MAX_AGE_DAYS = 400;

interface Analysis {
  file: TallyFile;
  states: Map<string, ListState>;
  matches: Map<string, PersonMatch>;
  drinkMap: Map<string, Drink>;
  missingDrinks: string[];
  accounts: User[];
  imports: TallyImport[];
}

async function analyze(app: Application, input: unknown): Promise<Analysis> {
  const file = parseTallyFile(input);
  const [users, drinks, imports, aliases]: [User[], Drink[], TallyImport[], TallyAlias[]] = await Promise.all([
    app.locals.userDao.findAll(),
    app.locals.drinkDao.findAll(),
    app.locals.tallyImportDao.findAll(),
    app.locals.tallyAliasDao.findAll()
  ]);
  const active = imports.filter(entry => ACTIVE.includes(entry.status));
  const accounts = tallyTargets(users);
  const aliasMap = new Map(aliases.map(alias => [alias.aliasKey, alias.userId]));
  const usedKeys = [...new Set(file.lists.flatMap(list => list.lines.map(line => line.drinkKey)))];
  const { map: drinkMap, missing: missingDrinks } = mapDrinks(usedKeys, drinks);

  return {
    file,
    states: new Map(file.lists.map(list => [list.key, listState(list, active)])),
    matches: new Map(file.persons.map(person => [person.id, matchPerson(person, accounts, aliasMap)])),
    drinkMap,
    missingDrinks,
    accounts,
    imports
  };
}

// Personen, die in Listen mit Striche haben, die noch gebucht werden könnten
function personsInLists(lists: ToolList[]): Map<string, { strokes: number; lists: string[] }> {
  const result = new Map<string, { strokes: number; lists: string[] }>();
  for (const list of lists) {
    for (const line of list.lines) {
      const entry = result.get(line.personId) ?? { strokes: 0, lists: [] };
      entry.strokes += line.count;
      if (!entry.lists.includes(list.key)) entry.lists.push(list.key);
      result.set(line.personId, entry);
    }
  }
  return result;
}

function todayBerlin(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
}

// Buchungstag prüfen: gültiges Datum, nicht in der Zukunft, nicht uralt
export function checkBookingDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== value) return null;
  if (value > todayBerlin()) return null;
  if (Date.now() - date.getTime() > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return null;
  return value;
}

// Mittags deutscher Zeit, damit der Tag in jeder Zeitzone stimmt
export function bookingTimestamp(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(berlinMidnight(year, month, date) + 12 * 60 * 60 * 1000);
}

async function removeImportOrders(daos: BookingDaos, importId: string) {
  const orders = await daos.orderDao.findAll({ importId });
  for (const order of orders) {
    await daos.orderDao.delete(order.id);
    await adjustStock(daos.inventoryDao, order.drinkId, Number(order.value));
  }
  return orders.length;
}

export function tallyImportRoutes(app: Express) {
  const guard = [authMiddleware, requirePermission(PERMISSIONS.MANAGE_FINANCE)];

  // Bisherige Importe, neueste zuerst
  app.get('/api/tally-import', ...guard, async (req, res) => {
    try {
      const [imports, users]: [TallyImport[], User[]] = await Promise.all([
        req.app.locals.tallyImportDao.findAll(),
        req.app.locals.userDao.findAll()
      ]);
      const names = new Map(users.map(user => [user.id, displayName(user)]));
      res.json({
        imports: imports
          .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
          .map(entry => ({
            id: entry.id,
            listName: entry.listName,
            listDate: entry.listDate ?? null,
            bookingDate: entry.bookingDate ?? null,
            status: entry.status,
            fileName: entry.fileName,
            personCount: Number(entry.personCount),
            strokeCount: Number(entry.strokeCount),
            total: round2(Number(entry.total)),
            importedAt: new Date(Number(entry.createdAt)).toISOString(),
            importedBy: names.get(entry.importedById) ?? 'Unbekannt',
            closedAt: entry.closedAt ? new Date(Number(entry.closedAt)).toISOString() : null
          }))
      });
    } catch (error) {
      console.error('Fehler beim Laden der Strichlisten-Importe:', error);
      res.status(500).json({ error: 'Serverfehler' });
    }
  });

  // Personenliste für das Erfassungs-Tool ("Personen aus der App laden")
  app.get('/api/tally-import/persons-file', ...guard, async (req, res) => {
    try {
      const users: User[] = await req.app.locals.userDao.findAll();
      const personen = tallyTargets(users)
        .map(user =>
          user.role === 'kasse'
            ? {
                konto_id: user.id,
                gruppe: 'Bbr/Ak/FK',
                name: user.firstName,
                vorname: user.nickname ?? '',
                nachname: user.firstName,
                vo: ''
              }
            : {
                konto_id: user.id,
                gruppe: '',
                name: user.lastName || user.firstName,
                vorname: user.firstName,
                nachname: user.lastName,
                vo: user.nickname ?? ''
              }
        )
        .sort((a, b) => a.nachname.localeCompare(b.nachname, 'de') || a.vorname.localeCompare(b.vorname, 'de'));
      const day = todayBerlin();
      res
        .setHeader('Content-Disposition', `attachment; filename="Strichlisten-Personen_${day}.json"`)
        .json({ format: 'strichlisten-personen', version: 1, erstellt: new Date().toISOString(), personen });
    } catch (error) {
      console.error('Fehler beim Erstellen der Personenliste:', error);
      res.status(500).json({ error: 'Serverfehler' });
    }
  });

  // Schritt 1: Vorschau
  app.post('/api/tally-import/preview', ...guard, async (req, res) => {
    try {
      const analysis = await analyze(req.app, req.body?.file);
      const { file, states, matches } = analysis;
      const bookable = file.lists.filter(list => ['neu', 'geaendert'].includes(states.get(list.key)!.status));
      const involved = personsInLists(bookable);
      const priceWarnings = [...analysis.drinkMap.entries()]
        .map(([key, drink]) => ({ key, drink, toolPrice: file.drinks.find(d => d.key === key)!.price }))
        .filter(({ drink, toolPrice }) => Math.round(Number(drink.price) * 100) !== Math.round(toolPrice * 100))
        .map(
          ({ drink, toolPrice }) =>
            `${drink.name} ${drink.unit}: Strichliste ${toolPrice.toFixed(2)} €, App ${Number(drink.price).toFixed(2)} € – gebucht wird der Preis der Strichliste.`
        );

      res.json({
        version: file.version,
        typ: file.typ,
        savedAt: file.savedAt,
        warnings: [...file.warnings, ...priceWarnings],
        missingDrinks: analysis.missingDrinks,
        lists: file.lists.map(list => {
          const state = states.get(list.key)!;
          return {
            key: list.key,
            name: list.name,
            datum: list.datum,
            monat: list.monat,
            notiz: list.notiz,
            status: state.status,
            actions: state.actions,
            defaultAction: state.defaultAction,
            personCount: new Set(list.lines.map(line => line.personId)).size,
            strokeCount: list.strokeCount,
            total: list.totalCents / 100,
            previous: state.previous
              ? {
                  id: state.previous.id,
                  listName: state.previous.listName,
                  status: state.previous.status,
                  importedAt: new Date(Number(state.previous.createdAt)).toISOString(),
                  total: round2(Number(state.previous.total))
                }
              : null
          };
        }),
        persons: file.persons
          .filter(person => involved.has(person.id))
          .map(person => ({
            toolId: person.id,
            label: personLabel(person),
            gruppe: person.gruppe,
            strokes: involved.get(person.id)!.strokes,
            lists: involved.get(person.id)!.lists,
            match: matches.get(person.id)
          })),
        accounts: analysis.accounts.map(accountOption).sort((a, b) => a.fullName.localeCompare(b.fullName, 'de'))
      });
    } catch (error) {
      if (error instanceof TallyFileError) return res.status(400).json({ error: error.message });
      console.error('Fehler bei der Vorschau des Strichlisten-Imports:', error);
      res.status(500).json({ error: 'Serverfehler beim Lesen der Datei' });
    }
  });

  // Schritt 2: Buchen
  app.post('/api/tally-import/book', ...guard, async (req: AuthRequest, res) => {
    const decisions: Record<string, { action?: string; bookingDate?: string }> = req.body?.lists ?? {};
    const personChoices: Record<string, string> = req.body?.persons ?? {};
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.slice(0, 200) : '';
    try {
      const analysis = await analyze(req.app, req.body?.file);
      const { file, states, matches, drinkMap } = analysis;
      const accountIds = new Set(analysis.accounts.map(account => account.id));
      const persons = new Map(file.persons.map(person => [person.id, person]));

      // Erst alles prüfen, dann buchen
      const plan: { list: ToolList; action: ListAction; bookingDate: string | null; state: ListState }[] = [];
      const errors: string[] = [];
      for (const list of file.lists) {
        const state = states.get(list.key)!;
        const wanted = (decisions[list.key]?.action ?? 'ueberspringen') as ListAction;
        if (!state.actions.includes(wanted)) {
          errors.push(`„${list.name}“: Aktion „${wanted}“ ist nicht möglich (Status: ${state.status}).`);
          continue;
        }
        if (wanted === 'ueberspringen') continue;
        let bookingDate: string | null = null;
        if (wanted !== 'bilanz') {
          bookingDate = checkBookingDate(decisions[list.key]?.bookingDate ?? list.datum);
          if (!bookingDate)
            errors.push(`„${list.name}“: Bitte ein gültiges Buchungsdatum angeben (nicht in der Zukunft).`);
        }
        plan.push({ list, action: wanted, bookingDate, state });
      }

      const resolved = new Map<string, string>();
      for (const { list, action } of plan) {
        if (action === 'bilanz') continue;
        for (const line of list.lines) {
          if (resolved.has(line.personId)) continue;
          const choice = personChoices[line.personId] || matches.get(line.personId)?.userId || '';
          if (!accountIds.has(choice)) {
            errors.push(`„${list.name}“: ${personLabel(persons.get(line.personId)!)} ist keinem Konto zugeordnet.`);
            resolved.set(line.personId, '');
          } else {
            resolved.set(line.personId, choice);
          }
          if (!drinkMap.has(line.drinkKey)) errors.push(`Getränk „${line.drinkKey}“ gibt es in der App nicht.`);
        }
      }
      if (plan.length === 0) errors.push('Keine Liste zum Buchen ausgewählt.');
      if (errors.length > 0) return res.status(400).json({ error: [...new Set(errors)].join('\n') });

      const actorId = req.user!.id;
      const result = await withBookingTransaction(req.app, async daos => {
        let booked = 0;
        let orders = 0;
        let total = 0;
        for (const { list, action, bookingDate, state } of plan) {
          if (action === 'ersetzen' && state.previous) {
            await removeImportOrders(daos, state.previous.id);
            await daos.tallyImportDao.update({
              id: state.previous.id,
              status: 'ersetzt',
              closedAt: Date.now(),
              closedById: actorId
            });
          }

          const lines: TallyImportLine[] = list.lines.map(line => ({
            userId: action === 'bilanz' ? '' : resolved.get(line.personId)!,
            toolPersonId: line.personId,
            drinkKey: line.drinkKey,
            count: line.count,
            price: line.price
          }));
          const created = await daos.tallyImportDao.create({
            listKey: list.key,
            listName: list.name,
            listDate: list.datum,
            bookingDate,
            contentHash: list.contentHash,
            status: action === 'bilanz' ? 'bilanz' : 'gebucht',
            fileName,
            toolVersion: file.version,
            personCount: new Set(list.lines.map(line => line.personId)).size,
            strokeCount: list.strokeCount,
            total: list.totalCents / 100,
            lines,
            importedById: actorId,
            closedAt: null,
            closedById: null
          });
          if (action === 'bilanz') continue;

          // Je Konto und Getränk eine Buchung (gleiche Person kann im Tool doppelt vorkommen)
          const grouped = new Map<string, { userId: string; drinkKey: string; count: number; price: number }>();
          for (const line of lines) {
            const key = `${line.userId}|${line.drinkKey}|${line.price}`;
            const entry = grouped.get(key) ?? { ...line, count: 0 };
            entry.count += line.count;
            grouped.set(key, entry);
          }
          const date = bookingTimestamp(bookingDate!);
          for (const entry of grouped.values()) {
            const drink = drinkMap.get(entry.drinkKey)!;
            await daos.orderDao.create({
              userId: entry.userId,
              bookedById: actorId,
              drinkId: drink.id,
              name: drink.name,
              unit: drink.unit,
              value: entry.count,
              price: entry.price,
              date,
              source: 'strichliste',
              importId: created.id,
              note: list.name
            });
            await adjustStock(daos.inventoryDao, drink.id, -entry.count);
            orders++;
          }
          booked++;
          total += list.totalCents;
        }

        // Zuordnungen für Personen ohne konto_id merken, damit sie beim nächsten Mal automatisch passen
        for (const [personId, userId] of resolved) {
          const person = persons.get(personId)!;
          if (!userId || person.kontoId === userId) continue;
          const key = aliasKey(person);
          const existing = await daos.tallyAliasDao.findOne({ aliasKey: key });
          if (!existing) await daos.tallyAliasDao.create({ aliasKey: key, userId });
          else if (existing.userId !== userId) await daos.tallyAliasDao.update({ id: existing.id, userId });
        }
        return { booked, marked: plan.filter(p => p.action === 'bilanz').length, orders, total: total / 100 };
      });

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof TallyFileError) return res.status(400).json({ error: error.message });
      if ((error as { code?: string }).code === '23505') {
        return res
          .status(409)
          .json({ error: 'Eine der Listen wurde gerade schon importiert. Bitte die Vorschau neu laden.' });
      }
      console.error('Fehler beim Buchen des Strichlisten-Imports:', error);
      res.status(500).json({ error: 'Serverfehler beim Buchen – es wurde nichts gebucht.' });
    }
  });

  // Import zurücknehmen: Striche dieser Liste löschen (bzw. die Markierung "in der Bilanz" aufheben)
  app.post('/api/tally-import/:id/undo', ...guard, async (req: AuthRequest, res) => {
    const id = String(req.params.id);
    try {
      const entry: TallyImport | null = await req.app.locals.tallyImportDao.findOne({ id });
      if (!entry || !ACTIVE.includes(entry.status)) {
        return res.status(404).json({ error: 'Import nicht gefunden oder schon zurückgenommen' });
      }
      const removed = await withBookingTransaction(req.app, async daos => {
        const count = await removeImportOrders(daos, id);
        await daos.tallyImportDao.update({
          id,
          status: 'zurueckgenommen',
          closedAt: Date.now(),
          closedById: req.user!.id
        });
        return count;
      });
      res.json({ removed });
    } catch (error) {
      console.error(`Fehler beim Zurücknehmen des Imports ${id}:`, error);
      res.status(500).json({ error: 'Serverfehler beim Zurücknehmen' });
    }
  });
}
