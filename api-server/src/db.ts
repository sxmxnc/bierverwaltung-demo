/* Autor: Prof. Dr. Norman Lahme-Hütig (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Express } from 'express';

import config from '../config.json' with { type: 'json' };
const { Pool } = pg; // eslint-disable-line @typescript-eslint/naming-convention
import { InMemoryGenericDAO } from './models/in-memory-generic.dao.js';
import { PsqlGenericDAO } from './models/psql-generic.dao.js';
import { Drink } from './models/drink.js';
import { Group } from './models/group.js';
import { Order } from './models/order.js';
import { StockEntry } from './models/stock-entry.js';
import { InventoryItem } from './models/inventory.js';
import { User } from './models/user-auth.js';
import { Role } from './models/role.js';
import { StockAlert } from './models/stock-alert.js';
import { Payment } from './models/payment.js';
import { TallyAlias, TallyImport } from './models/tally-import.js';
import { BankIban, BankImport, BankTransactionRecord } from './models/bank.js';
import { PERMISSIONS } from './middleware/permissions.js';
import { CLUB } from './club.js';

export default async function startDB(app: Express) {
  if (config.db.use === 'psql') {
    await startPsql(app);
  } else {
    await startInMemoryDB(app);
  }
  return async () => Promise.resolve();
}

// Ohne Datenbank (config.db.use != "psql"): gleiche Stamm- und Demo-Daten wie init.sql + demo-data.sql
async function startInMemoryDB(app: Express) {
  process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
  const hashedPw = await bcrypt.hash('Test1234!', 10);

  const drinkDao = new InMemoryGenericDAO<Drink>();
  const groupDao = new InMemoryGenericDAO<Group>();
  const orderDao = new InMemoryGenericDAO<Order>();
  const userDao = new InMemoryGenericDAO<User>();
  const roleDao = new InMemoryGenericDAO<Role>();
  const paymentDao = new InMemoryGenericDAO<Payment>();
  app.locals.drinkDao = drinkDao;
  app.locals.groupDao = groupDao;
  app.locals.orderDao = orderDao;
  app.locals.stockEntryDao = new InMemoryGenericDAO<StockEntry>();
  app.locals.inventoryDao = new InMemoryGenericDAO<InventoryItem>();
  app.locals.userDao = userDao;
  app.locals.roleDao = roleDao;
  app.locals.stockAlertDao = new InMemoryGenericDAO<StockAlert>();
  app.locals.paymentDao = paymentDao;
  app.locals.tallyImportDao = new InMemoryGenericDAO<TallyImport>();
  app.locals.tallyAliasDao = new InMemoryGenericDAO<TallyAlias>();
  app.locals.bankImportDao = new InMemoryGenericDAO<BankImport>();
  app.locals.bankTransactionDao = new InMemoryGenericDAO<BankTransactionRecord>();
  app.locals.bankIbanDao = new InMemoryGenericDAO<BankIban>();

  const roles: [string, string, string, string[]][] = [
    ['admin', 'Bierwart', '#4483bb', Object.values(PERMISSIONS)],
    ['user', 'Mitglied', '#6b7280', []],
    ['theke', 'Theke', '#93bb04', []],
    ['kasse', 'Kasse', '#b8a058', []]
  ];
  for (const [name, label, color, permissions] of roles) {
    await roleDao.create({ name, label, description: label, color, permissions, isSystem: true });
  }

  const groups: [string, string][] = [
    ['Bier vom Fass', '🍺'],
    ['Weizen, Helles & Co.', '🍻'],
    ['Softdrinks & Wasser', '🥤'],
    ['Sonstiges', '📦']
  ];
  const groupIds: string[] = [];
  for (const [index, [group, emoji]] of groups.entries()) {
    groupIds.push((await groupDao.create({ group, emoji, sortOrder: index + 1 })).id);
  }

  const drinks: [string, Drink['packaging'], string, number, number, boolean][] = [
    ['Bitburger', 'Fass', '0,2 l', 0.85, 0, true],
    ['Bitburger', 'Fass', '0,3 l', 1.25, 0, true],
    ['Bitburger', 'Fass', '0,5 l', 2.1, 0, true],
    ['Weizen', 'Flasche', '0,5 l', 1.5, 1, true],
    ['Helles', 'Flasche', '0,5 l', 1.5, 1, true],
    ['Bitburger Flasche', 'Flasche', '0,5 l', 1.3, 1, true],
    ['Weizen alkoholfrei', 'Flasche', '0,5 l', 1.5, 1, false],
    ['Bitburger alkoholfrei', 'Flasche', '0,33 l', 0.9, 1, false],
    ['Softdrink', 'Flasche', '0,2 l', 0.4, 2, false],
    ['Softdrink', 'Flasche', '0,3 l', 0.6, 2, false],
    ['Softdrink', 'Flasche', '0,5 l', 0.8, 2, false],
    ['Softdrink Flasche', 'Flasche', '1,0 l', 1.55, 2, false],
    ['Wasser Flasche', 'Flasche', '1,0 l', 1.1, 2, false]
  ];
  const createdDrinks: Drink[] = [];
  for (const [index, [name, packaging, unit, price, group, isBeer]] of drinks.entries()) {
    createdDrinks.push(
      await drinkDao.create({ name, packaging, unit, price, groupId: groupIds[group], sortOrder: index + 1, isBeer })
    );
  }

  const mandate = (debtorName: string, iban = '') => ({
    creditorName: CLUB.creditorName,
    creditorId: CLUB.creditorId,
    debtorName,
    debtorBank: '',
    iban
  });
  const account = (
    firstName: string,
    lastName: string,
    nickname: string | null,
    email: string,
    role: User['role'],
    status: User['status'] = 'active'
  ) =>
    userDao.create({
      firstName,
      lastName,
      nickname,
      email,
      password: role === 'kasse' ? '' : hashedPw,
      residence: '',
      role,
      status,
      sepaMandate: mandate(`${firstName} ${lastName}`.trim())
    });

  const bierwart = await account('Bierwart', '', null, 'bierwart@bierkasse.local', 'admin');
  const theke = await account('Theke', '', null, 'theke@bierkasse.local', 'theke');
  await account('Aktivenkasse', '', 'Quaestor', 'aktivenkasse@kasse.invalid', 'kasse');
  const fuxenkasse = await account('Fuxenkasse', '', 'Fuxmajor', 'fuxenkasse@kasse.invalid', 'kasse');
  const max = await account('Max', 'Mustermann', 'Maxe', 'max@example.org', 'user');
  const moritz = await account('Moritz', 'Beispiel', 'Hopfen', 'moritz@example.org', 'user');
  const paul = await account('Paul', 'Platzhalter', null, 'paul@example.org', 'user');
  await account('Erika', 'Neumann', null, 'erika@example.org', 'user', 'pending');

  const [bit02, bit03, bit05] = createdDrinks;
  const softdrink03 = createdDrinks[9];
  const demoOrders: [User, User, Drink, number][] = [
    [max, max, bit03, 4],
    [max, moritz, bit05, 1],
    [moritz, theke, bit03, 6],
    [moritz, moritz, softdrink03, 2],
    [fuxenkasse, max, bit02, 10]
  ];
  for (const [target, bookedBy, drink, value] of demoOrders) {
    await orderDao.create({
      userId: target.id,
      bookedById: bookedBy.id,
      drinkId: drink.id,
      name: drink.name,
      unit: drink.unit,
      value,
      price: drink.price,
      date: new Date(Date.now() - 24 * 60 * 60 * 1000)
    });
  }

  const demoPayments: [User, number, string][] = [
    [max, 20, 'Einzahlung (Überweisung)'],
    [paul, 10, 'Einzahlung (Bar)'],
    [fuxenkasse, 50, 'Einzahlung (Überweisung) – Fuxenkasse']
  ];
  for (const [user, amount, note] of demoPayments) {
    await paymentDao.create({
      userId: user.id,
      amount,
      note,
      date: new Date().toISOString(),
      createdByAdminId: bierwart.id
    });
  }
}

async function startPsql(app: Express) {
  const pool = await connectToPsql();
  await prepareDatabase(pool);
  app.locals.drinkDao = new PsqlGenericDAO<Drink>(pool, 'drinks');
  app.locals.groupDao = new PsqlGenericDAO<Group>(pool, 'groups');
  app.locals.orderDao = new PsqlGenericDAO<Order>(pool, 'orders');
  app.locals.stockEntryDao = new PsqlGenericDAO<StockEntry>(pool, 'stockentries');
  app.locals.inventoryDao = new PsqlGenericDAO<InventoryItem>(pool, 'inventoryitems');
  app.locals.userDao = new PsqlGenericDAO<User>(pool, 'users');
  app.locals.roleDao = new PsqlGenericDAO<Role>(pool, 'roles');
  app.locals.stockAlertDao = new PsqlGenericDAO<StockAlert>(pool, 'stockalerts');
  app.locals.paymentDao = new PsqlGenericDAO<Payment>(pool, 'payments');
  app.locals.tallyImportDao = new PsqlGenericDAO<TallyImport>(pool, 'tallyimports');
  app.locals.tallyAliasDao = new PsqlGenericDAO<TallyAlias>(pool, 'tallyaliases');
  app.locals.bankImportDao = new PsqlGenericDAO<BankImport>(pool, 'bankimports');
  app.locals.bankTransactionDao = new PsqlGenericDAO<BankTransactionRecord>(pool, 'banktransactions');
  app.locals.bankIbanDao = new PsqlGenericDAO<BankIban>(pool, 'bankibans');
  // für Buchungen, die ganz oder gar nicht laufen müssen (utils/transaction.ts)
  app.locals.pool = pool;
}

// Docker führt init.sql nur beim allerersten Start eines Datenbank-Volumes aus, Heroku & Co.
// gar nicht. Deshalb richtet sich die Datenbank beim Start selbst ein:
// - Schema (oberhalb von "-- @seed" in init.sql) ist idempotent und läuft immer,
// - Stammdaten (Getränke, Kassen, Bierwart, Theke) nur, wenn noch keine Konten existieren.
// So tauchen z. B. gelöschte Getränke nach einem Neustart nicht wieder auf.
async function prepareDatabase(pool: pg.Pool) {
  const initSql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'init.sql'), 'utf8');
  const [schema, seed] = initSql.split('-- @seed');
  await pool.query(schema);
  await ensureJwtSecret(pool);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS "count" FROM "users"');
  if (rows[0].count === 0 && seed) {
    await pool.query(seed);
    // frische Datenbank hat schon den aktuellen Stand – Datenmigrationen nicht nötig
    await pool.query(
      `INSERT INTO "appsettings" ("key", "value") VALUES ('migration:beer-v1', 'done') ON CONFLICT DO NOTHING`
    );
    console.log('Leere Datenbank: Stammdaten (Getränke, Kassen, Bierwart, Theke) angelegt');
  }

  // Kontoarten der Sauerlandia-Version auch in bestehenden Datenbanken
  await pool.query(`
    INSERT INTO "roles" ("id", "createdAt", "name", "label", "description", "color", "permissions", "isSystem") VALUES
      ('role-theke', 0, 'theke', 'Theke', 'Gemeinsames Gerät an der Theke (z. B. iPad). Kann nur für andere stricheln.', '#93bb04', '[]', TRUE),
      ('role-kasse', 0, 'kasse', 'Kasse', 'Sammelkonto wie Aktivenkasse oder Fuxenkasse. Kann sich nicht anmelden.', '#b8a058', '[]', TRUE)
    ON CONFLICT DO NOTHING;
  `);

  await migrateBeerScoreboard(pool);
  await replaceKnownStartPasswords(pool);
  await applyBierwartPassword(pool);
  if (process.env.DEMO_LOGINS === 'true') await ensureDemoMembers(pool);
}

// Ist BIERWART_PASSWORD gesetzt, gilt beim Start genau dieses Passwort für den Bierwart-Zugang
// (z. B. wenn das Startpasswort verloren ging). Der Wert selbst wird nie geloggt.
async function applyBierwartPassword(pool: pg.Pool) {
  const wanted = process.env.BIERWART_PASSWORD ?? '';
  if (wanted.length < 8) return;
  const { rows } = await pool.query('SELECT "password" FROM "users" WHERE "id" = \'user-bierwart\'');
  if (!rows[0] || (rows[0].password && (await bcrypt.compare(wanted, rows[0].password)))) return;
  await pool.query('UPDATE "users" SET "password" = $1 WHERE "id" = \'user-bierwart\'', [
    await bcrypt.hash(wanted, 10)
  ]);
  console.log('Passwort für bierwart@bierkasse.local aus BIERWART_PASSWORD übernommen.');
}

// Einmalig für bestehende Datenbanken (z. B. den Heroku-Prototyp): Getränke als Bier kennzeichnen
// und "Weizen / alkoholfrei" in Weizen und Weizen alkoholfrei aufteilen, damit nur Bier in die Rangliste zählt.
async function migrateBeerScoreboard(pool: pg.Pool) {
  const done = await pool.query(`SELECT 1 FROM "appsettings" WHERE "key" = 'migration:beer-v1'`);
  if (done.rowCount) return;

  await pool.query(
    `UPDATE "drinks" SET "name" = 'Weizen' WHERE "id" = 'drink-weizen' AND "name" = 'Weizen / alkoholfrei'`
  );
  const existing = await pool.query(`SELECT 1 FROM "drinks" WHERE "id" = 'drink-weizen-alkoholfrei'`);
  const groupExists = await pool.query(`SELECT 1 FROM "groups" WHERE "id" = 'group-biere'`);
  if (!existing.rowCount && groupExists.rowCount) {
    // Platz hinter "Bitburger Flasche" schaffen
    await pool.query(`UPDATE "drinks" SET "sortOrder" = "sortOrder" + 1 WHERE "sortOrder" >= 7`);
    await pool.query(
      `INSERT INTO "drinks" ("id", "createdAt", "name", "packaging", "unit", "price", "groupId", "sortOrder", "isBeer")
       VALUES ('drink-weizen-alkoholfrei', $1, 'Weizen alkoholfrei', 'Flasche', '0,5 l', 1.50, 'group-biere', 7, FALSE)`,
      [Date.now()]
    );
  }
  await pool.query(
    `UPDATE "drinks" SET "isBeer" = TRUE WHERE "id" IN
      ('drink-bitburger-02', 'drink-bitburger-03', 'drink-bitburger-05', 'drink-weizen', 'drink-helles', 'drink-bitburger-flasche')`
  );
  await pool.query(
    `INSERT INTO "appsettings" ("key", "value") VALUES ('migration:beer-v1', 'done') ON CONFLICT DO NOTHING`
  );
  console.log('Datenmigration: Bier-Kennzeichen gesetzt, Weizen alkoholfrei als eigenes Getränk angelegt');
}

// Ohne gesetztes JWT_SECRET erzeugt die App in Produktion einmalig einen langen Zufallsschlüssel
// und legt ihn in der Datenbank ab – so übersteht er Neustarts, ohne dass jemand ihn eintragen muss.
async function ensureJwtSecret(pool: pg.Pool) {
  const fromEnv = process.env.JWT_SECRET ?? '';
  if (fromEnv.length >= 32 && fromEnv !== 'your_secret_key_here') return;
  if (process.env.NODE_ENV !== 'production' && fromEnv) return;

  await pool.query('INSERT INTO "appsettings" ("key", "value") VALUES (\'jwtSecret\', $1) ON CONFLICT DO NOTHING', [
    crypto.randomBytes(48).toString('hex')
  ]);
  const { rows } = await pool.query('SELECT "value" FROM "appsettings" WHERE "key" = \'jwtSecret\'');
  process.env.JWT_SECRET = rows[0].value;
  console.log('Login-Schlüssel aus der Datenbank geladen (JWT_SECRET ist nicht gesetzt).');
}

// Prototyp: Beispiel-Bundesbrüder ohne Passwort. Angemeldet wird über die Demo-Links (routes/demo.ts).
async function ensureDemoMembers(pool: pg.Pool) {
  const members: [string, string, string, string | null, string][] = [
    ['demo-max', 'Max', 'Mustermann', 'Maxe', 'max@example.org'],
    ['demo-moritz', 'Moritz', 'Beispiel', 'Hopfen', 'moritz@example.org'],
    ['demo-paul', 'Paul', 'Platzhalter', null, 'paul@example.org']
  ];
  for (const [id, firstName, lastName, nickname, email] of members) {
    await pool.query(
      `INSERT INTO "users" ("id", "createdAt", "firstName", "lastName", "nickname", "email", "password", "residence", "role", "status", "sepaMandate")
       VALUES ($1, $2, $3, $4, $5, $6, '', '', 'user', 'active', $7) ON CONFLICT DO NOTHING`,
      [
        id,
        Date.now(),
        firstName,
        lastName,
        nickname,
        email,
        JSON.stringify({
          creditorName: CLUB.creditorName,
          creditorId: CLUB.creditorId,
          debtorName: `${firstName} ${lastName}`,
          debtorBank: '',
          iban: ''
        })
      ]
    );
  }
}

// Bcrypt-Hash des öffentlich bekannten Demo-Passworts "Test1234!" aus init.sql
const KNOWN_DEMO_HASH = '$2b$10$iOH8G.wmNx9BfD04n6usIeod7CHgvZjD7ZA1zZPWUg3oFigffVXUS';

// In Produktion dürfen Bierwart und Theke nicht mit dem bekannten Demo-Passwort erreichbar sein.
// Gesetzt wird das Passwort aus INITIAL_BIERWART_PASSWORD / INITIAL_THEKE_PASSWORD – fehlt die
// Variable, wird ein zufälliges Passwort erzeugt und einmalig ins Server-Log geschrieben.
async function replaceKnownStartPasswords(pool: pg.Pool) {
  if (process.env.NODE_ENV !== 'production') return;

  const accounts = [
    { id: 'user-bierwart', env: 'INITIAL_BIERWART_PASSWORD', label: 'Bierwart' },
    { id: 'user-theke', env: 'INITIAL_THEKE_PASSWORD', label: 'Theke' }
  ];
  for (const account of accounts) {
    const { rows } = await pool.query('SELECT "email", "password" FROM "users" WHERE "id" = $1', [account.id]);
    if (!rows[0] || rows[0].password !== KNOWN_DEMO_HASH) continue;

    const fromEnv = process.env[account.env];
    const usable = typeof fromEnv === 'string' && fromEnv.length >= 8;
    const password = usable ? fromEnv : crypto.randomBytes(9).toString('base64url');
    await pool.query('UPDATE "users" SET "password" = $1 WHERE "id" = $2', [
      await bcrypt.hash(password, 10),
      account.id
    ]);
    console.log(
      usable
        ? `Startpasswort für ${account.label} (${rows[0].email}) aus ${account.env} gesetzt.`
        : `Startpasswort für ${account.label} (${rows[0].email}): ${password} – bitte notieren und nach dem ersten Login ändern.`
    );
  }
}

// Verbindung über DATABASE_URL (Heroku, Railway, Render; mit SSL) oder über config.json/PG*-Variablen
// (Docker Compose, lokal; ohne SSL). Ein Pool baut abgerissene Verbindungen selbstständig neu auf.
async function connectToPsql() {
  const ssl = process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false };
  const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 5 })
    : new Pool({
        user: config.db.connect.user,
        host: process.env.PGHOST ?? config.db.connect.host,
        database: config.db.connect.database,
        password: config.db.connect.password,
        port: Number(process.env.PGPORT ?? config.db.connect.port.psql),
        max: 5
      });

  // Fehler auf ruhenden Verbindungen nur protokollieren statt den Prozess abstürzen zu lassen
  pool.on('error', err => console.error('PostgreSQL-Verbindungsfehler:', err.message));

  try {
    await pool.query('SELECT 1');
    return pool;
  } catch (err) {
    console.log('Could not connect to PostgreSQL: ', err);
    process.exit(1);
  }
}
