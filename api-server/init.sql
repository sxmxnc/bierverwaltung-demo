CREATE TABLE IF NOT EXISTS "groups" (
  "id"        TEXT PRIMARY KEY,
  "createdAt" BIGINT NOT NULL,
  "group"     TEXT NOT NULL,
  "emoji"     TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "drinks" (
  "id"                TEXT PRIMARY KEY,
  "createdAt"         BIGINT NOT NULL,
  "name"              TEXT NOT NULL,
  "packaging"         TEXT NOT NULL,
  "unit"              TEXT NOT NULL,
  "price"             NUMERIC NOT NULL,
  "groupId"           TEXT NOT NULL REFERENCES "groups"("id"),
  "lowStockThreshold" INTEGER,
  "sortOrder"         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "orders" (
  "id"        TEXT PRIMARY KEY,
  "createdAt" BIGINT NOT NULL,
  "userId"    TEXT NOT NULL,
  "bookedById" TEXT,
  "drinkId"   TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "unit"      TEXT NOT NULL,
  "value"     NUMERIC NOT NULL,
  "price"     NUMERIC NOT NULL,
  "date"      TIMESTAMPTZ NOT NULL
);

-- Kontoarten (role): admin = Bierwart, user = Mitglied, theke = Theken-Gerät, kasse = Sammelkonto.
-- Status: active, pending (wartet auf Freischaltung), suspended, inactive.
-- Hinweis: kein "balance"-Feld. Der Kontostand wird ausschließlich aus
-- orders + payments berechnet (api-server/src/utils/account.ts).
CREATE TABLE IF NOT EXISTS "users" (
  "id"          TEXT PRIMARY KEY,
  "createdAt"   BIGINT NOT NULL,
  "firstName"   TEXT NOT NULL,
  "lastName"    TEXT NOT NULL,
  "nickname"    TEXT,
  "email"       TEXT NOT NULL UNIQUE,
  "password"    TEXT NOT NULL,
  "residence"   TEXT NOT NULL,
  "role"        TEXT NOT NULL DEFAULT 'user',
  "status"      TEXT NOT NULL DEFAULT 'active',
  "sepaMandate" JSONB
);

CREATE TABLE IF NOT EXISTS "roles" (
  "id"          TEXT PRIMARY KEY,
  "createdAt"   BIGINT NOT NULL,
  "name"        TEXT NOT NULL UNIQUE,
  "label"       TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "color"       TEXT NOT NULL,
  "permissions" JSONB NOT NULL,
  "isSystem"    BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "stockentries" (
  "id"           TEXT PRIMARY KEY,
  "createdAt"    BIGINT NOT NULL,
  "drinkId"      TEXT NOT NULL REFERENCES "drinks"("id"),
  "drinkName"    TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "quantityAdded" INTEGER NOT NULL,
  "price"        NUMERIC NOT NULL DEFAULT 0,
  "batchId"      TEXT NOT NULL DEFAULT '',
  "timestamp"    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS "inventoryitems" (
  "id"        TEXT PRIMARY KEY,
  "createdAt" BIGINT NOT NULL,
  "drinkId"   TEXT NOT NULL REFERENCES "drinks"("id"),
  "stock"     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "payments" (
  "id"                 TEXT PRIMARY KEY,
  "createdAt"          BIGINT NOT NULL,
  "userId"             TEXT NOT NULL REFERENCES "users"("id"),
  "amount"             NUMERIC NOT NULL,
  "note"               TEXT NOT NULL DEFAULT '',
  "date"               TIMESTAMPTZ NOT NULL,
  "createdByAdminId"   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "stockalerts" (
  "id"             TEXT PRIMARY KEY,
  "createdAt"      BIGINT NOT NULL,
  "drinkId"        TEXT NOT NULL,
  "drinkName"      TEXT NOT NULL,
  "reportedByName" TEXT NOT NULL,
  "message"        TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'open'
);

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "resetToken" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "resetTokenExpiry" BIGINT;

-- Spalten der Sauerlandia-Version (für Datenbanken aus der Uni-Version)
ALTER TABLE "users"  ADD COLUMN IF NOT EXISTS "nickname" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "bookedById" TEXT;
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "drinks" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "drinks" ADD COLUMN IF NOT EXISTS "isBeer" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS "orders_date_idx" ON "orders" ("date");

CREATE INDEX IF NOT EXISTS "orders_userId_idx" ON "orders" ("userId");
CREATE INDEX IF NOT EXISTS "orders_bookedById_idx" ON "orders" ("bookedById");
CREATE INDEX IF NOT EXISTS "payments_userId_idx" ON "payments" ("userId");

-- Herkunft einer Buchung: NULL = in der App gestrichelt, 'strichliste' = aus der Backup-Strichliste
-- importiert (Erfassungs-Tool), 'nachtrag' = vom Bierwart nachgetragen. Nur NULL zählt in die Rangliste.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "importId" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "note" TEXT;
CREATE INDEX IF NOT EXISTS "orders_importId_idx" ON "orders" ("importId");

-- Importierte Listen aus dem Erfassungs-Tool (eine Zeile je Liste und Import), siehe docs/STRICHLISTEN-FORMAT.md.
-- status: gebucht | bilanz (schon in der Excel-Bilanz, nicht gebucht) | ersetzt | zurueckgenommen
CREATE TABLE IF NOT EXISTS "tallyimports" (
  "id"           TEXT PRIMARY KEY,
  "createdAt"    BIGINT NOT NULL,
  "listKey"      TEXT NOT NULL,
  "listName"     TEXT NOT NULL,
  "listDate"     TEXT,
  "bookingDate"  TEXT,
  "contentHash"  TEXT NOT NULL,
  "status"       TEXT NOT NULL,
  "fileName"     TEXT NOT NULL DEFAULT '',
  "toolVersion"  INTEGER NOT NULL,
  "personCount"  INTEGER NOT NULL,
  "strokeCount"  INTEGER NOT NULL,
  "total"        NUMERIC NOT NULL,
  "lines"        JSONB NOT NULL,
  "importedById" TEXT NOT NULL,
  "closedAt"     BIGINT,
  "closedById"   TEXT
);
CREATE INDEX IF NOT EXISTS "tallyimports_listKey_idx" ON "tallyimports" ("listKey");
-- Eine Liste ist höchstens einmal aktiv (gebucht oder als "in der Bilanz" markiert)
CREATE UNIQUE INDEX IF NOT EXISTS "tallyimports_active_key" ON "tallyimports" ("listKey")
  WHERE "status" IN ('gebucht', 'bilanz');

-- Gemerkte Zuordnung "Person im Erfassungs-Tool" -> Konto (für Personen ohne konto_id)
CREATE TABLE IF NOT EXISTS "tallyaliases" (
  "id"        TEXT PRIMARY KEY,
  "createdAt" BIGINT NOT NULL,
  "aliasKey"  TEXT NOT NULL UNIQUE,
  "userId"    TEXT NOT NULL
);

-- Kategorie eines Kontos wie in der Excel-Bilanz: aktiv | ah | hausbewohner | gast | verein (NULL = nicht gesetzt)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "category" TEXT;
-- Konto ohne Login (importiert, password = ''): Wer sich mit dessen E-Mail registriert, wartet hier auf die
-- Freigabe durch den Bierwart, ohne dass das Konto an der Theke gesperrt wird.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pendingPassword" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "loginRequestedAt" BIGINT;

-- Art und Herkunft einer Zahlung: kind = 'uebertrag' (Eröffnungsbuchung aus der Excel-Bilanz), sonst NULL.
-- source z. B. "Bilanz November 2026, Blatt AH, Zeile 31". Je Konto höchstens ein Übertrag.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "source" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "payments_uebertrag_key" ON "payments" ("userId") WHERE "kind" = 'uebertrag';

-- Bank-Journal: jede Buchung aus den CSV-Exporten genau einmal (fingerprint), auch Ausgänge.
-- status: offen | zugeordnet | ignoriert | vor_stichtag (steckt schon im Übertrag aus der Excel)
-- category (für Teile, die nicht auf ein Personenkonto gehen): rechnung | roth | intern | bar | spende | sonstiges
CREATE TABLE IF NOT EXISTS "bankimports" (
  "id"           TEXT PRIMARY KEY,
  "createdAt"    BIGINT NOT NULL,
  "fileName"     TEXT NOT NULL DEFAULT '',
  "fileHash"     TEXT NOT NULL,
  "importedById" TEXT NOT NULL,
  "firstDate"    TEXT,
  "lastDate"     TEXT,
  "rows"         INTEGER NOT NULL,
  "added"        INTEGER NOT NULL,
  "known"        INTEGER NOT NULL,
  "warnings"     JSONB NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS "banktransactions" (
  "id"           TEXT PRIMARY KEY,
  "createdAt"    BIGINT NOT NULL,
  "fingerprint"  TEXT NOT NULL UNIQUE,
  "accountIban"  TEXT NOT NULL DEFAULT '',
  "bookingDate"  TEXT NOT NULL,
  "valueDate"    TEXT NOT NULL DEFAULT '',
  "name"         TEXT NOT NULL DEFAULT '',
  "iban"         TEXT NOT NULL DEFAULT '',
  "bookingText"  TEXT NOT NULL DEFAULT '',
  "purpose"      TEXT NOT NULL DEFAULT '',
  "amount"       NUMERIC NOT NULL,
  "balanceAfter" NUMERIC,
  "status"       TEXT NOT NULL,
  "category"     TEXT,
  "note"         TEXT NOT NULL DEFAULT '',
  "importId"     TEXT NOT NULL,
  "decidedById"  TEXT,
  "decidedAt"    BIGINT
);
CREATE INDEX IF NOT EXISTS "banktransactions_status_idx" ON "banktransactions" ("status");
-- Gelernte Zuordnung IBAN -> Konto; askAlways = zahlt für mehrere (Aktivenkasse, Eltern) → immer nachfragen
CREATE TABLE IF NOT EXISTS "bankibans" (
  "id"        TEXT PRIMARY KEY,
  "createdAt" BIGINT NOT NULL,
  "iban"      TEXT NOT NULL UNIQUE,
  "userId"    TEXT,
  "askAlways" BOOLEAN NOT NULL DEFAULT FALSE
);
-- Zahlung aus dem Bank-Journal (eine Buchung kann auf mehrere Konten aufgeteilt werden)
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "bankTransactionId" TEXT;
CREATE INDEX IF NOT EXISTS "payments_bankTransactionId_idx" ON "payments" ("bankTransactionId");

-- Einstellungen der App (z. B. automatisch erzeugter Login-Schlüssel)
CREATE TABLE IF NOT EXISTS "appsettings" (
  "key"   TEXT PRIMARY KEY,
  "value" TEXT NOT NULL
);

-- Alles oberhalb dieser Markierung ist idempotent und läuft bei jedem Start des API-Servers.
-- Alles darunter (Stammdaten) läuft nur, wenn die Datenbank noch leer ist.
-- @seed

-- ---------------------------------------------------------------------------
-- Stammdaten K.D.St.V. Sauerlandia
-- Demo-Mitglieder und Demo-Buchungen stehen in demo-data.sql (nur für die lokale Entwicklung).
-- ---------------------------------------------------------------------------

-- Getränkegruppen in der Reihenfolge der Strichliste
INSERT INTO "groups" ("id", "createdAt", "group", "emoji", "sortOrder") VALUES
  ('group-fass',       0, 'Bier vom Fass',          '🍺', 1),
  ('group-biere',      0, 'Weizen, Helles & Co.',   '🍻', 2),
  ('group-softdrinks', 0, 'Softdrinks & Wasser',    '🥤', 3),
  ('group-sonstiges',  0, 'Sonstiges',              '📦', 4)
ON CONFLICT DO NOTHING;

-- Getränkeliste Februar 2026 (Preise gültig seit 13.03.2025)
-- isBeer: zählt für die Rangliste (gezapftes Bier und Bierflaschen, nichts Alkoholfreies)
INSERT INTO "drinks" ("id", "createdAt", "name", "packaging", "unit", "price", "groupId", "sortOrder", "isBeer") VALUES
  ('drink-bitburger-02',         0, 'Bitburger',             'Fass',    '0,2 l',  0.85, 'group-fass',        1, TRUE),
  ('drink-bitburger-03',         0, 'Bitburger',             'Fass',    '0,3 l',  1.25, 'group-fass',        2, TRUE),
  ('drink-bitburger-05',         0, 'Bitburger',             'Fass',    '0,5 l',  2.10, 'group-fass',        3, TRUE),
  ('drink-weizen',               0, 'Weizen',                'Flasche', '0,5 l',  1.50, 'group-biere',       4, TRUE),
  ('drink-helles',               0, 'Helles',                'Flasche', '0,5 l',  1.50, 'group-biere',       5, TRUE),
  ('drink-bitburger-flasche',    0, 'Bitburger Flasche',     'Flasche', '0,5 l',  1.30, 'group-biere',       6, TRUE),
  ('drink-weizen-alkoholfrei',   0, 'Weizen alkoholfrei',    'Flasche', '0,5 l',  1.50, 'group-biere',       7, FALSE),
  ('drink-bitburger-alkoholfrei',0, 'Bitburger alkoholfrei', 'Flasche', '0,33 l', 0.90, 'group-biere',       8, FALSE),
  ('drink-softdrink-02',         0, 'Softdrink',             'Flasche', '0,2 l',  0.40, 'group-softdrinks',  9, FALSE),
  ('drink-softdrink-03',         0, 'Softdrink',             'Flasche', '0,3 l',  0.60, 'group-softdrinks', 10, FALSE),
  ('drink-softdrink-05',         0, 'Softdrink',             'Flasche', '0,5 l',  0.80, 'group-softdrinks', 11, FALSE),
  ('drink-softdrink-flasche',    0, 'Softdrink Flasche',     'Flasche', '1,0 l',  1.55, 'group-softdrinks', 12, FALSE),
  ('drink-wasser-flasche',       0, 'Wasser Flasche',        'Flasche', '1,0 l',  1.10, 'group-softdrinks', 13, FALSE)
ON CONFLICT DO NOTHING;

-- Rollen (Berechtigungen je Kontoart)
INSERT INTO "roles" ("id", "createdAt", "name", "label", "description", "color", "permissions", "isSystem") VALUES
  ('role-admin', 0, 'admin', 'Bierwart',
   'Vollständiger Zugriff: Mitglieder, Getränke, Bestand, Finanzen und Statistiken.',
   '#4483bb', '["manage_users","manage_roles","manage_drinks","manage_finance","view_statistics"]', TRUE),
  ('role-user', 0, 'user', 'Mitglied',
   'Kann für sich und andere stricheln und das eigene Konto einsehen.',
   '#6b7280', '[]', TRUE),
  ('role-theke', 0, 'theke', 'Theke',
   'Gemeinsames Gerät an der Theke (z. B. iPad). Kann nur für andere stricheln.',
   '#93bb04', '[]', TRUE),
  ('role-kasse', 0, 'kasse', 'Kasse',
   'Sammelkonto wie Aktivenkasse oder Fuxenkasse. Kann sich nicht anmelden.',
   '#b8a058', '[]', TRUE)
ON CONFLICT DO NOTHING;

-- Konten, die es immer gibt.
-- Bierwart und Theke: Startpasswort "Test1234!" – nach dem ersten Login unbedingt ändern!
INSERT INTO "users" ("id", "createdAt", "firstName", "lastName", "nickname", "email", "password", "residence", "role", "status", "sepaMandate") VALUES
  ('user-bierwart', 0, 'Bierwart', '', NULL, 'bierwart@bierkasse.local', '$2b$10$iOH8G.wmNx9BfD04n6usIeod7CHgvZjD7ZA1zZPWUg3oFigffVXUS', '', 'admin', 'active',
   '{"creditorName":"K.D.St.V. Sauerlandia – Bierkasse","creditorId":"DE98ZZZ09999999999","debtorName":"Bierwart","debtorBank":"","iban":""}'),
  ('user-theke', 0, 'Theke', '', NULL, 'theke@bierkasse.local', '$2b$10$iOH8G.wmNx9BfD04n6usIeod7CHgvZjD7ZA1zZPWUg3oFigffVXUS', '', 'theke', 'active',
   '{"creditorName":"K.D.St.V. Sauerlandia – Bierkasse","creditorId":"DE98ZZZ09999999999","debtorName":"Theke","debtorBank":"","iban":""}'),
  ('kasse-aktivenkasse', 0, 'Aktivenkasse', '', 'Quaestor', 'aktivenkasse@kasse.invalid', '', '', 'kasse', 'active',
   '{"creditorName":"K.D.St.V. Sauerlandia – Bierkasse","creditorId":"DE98ZZZ09999999999","debtorName":"Aktivenkasse","debtorBank":"","iban":""}'),
  ('kasse-fuxenkasse', 0, 'Fuxenkasse', '', 'Fuxmajor', 'fuxenkasse@kasse.invalid', '', '', 'kasse', 'active',
   '{"creditorName":"K.D.St.V. Sauerlandia – Bierkasse","creditorId":"DE98ZZZ09999999999","debtorName":"Fuxenkasse","debtorBank":"","iban":""}')
ON CONFLICT DO NOTHING;
