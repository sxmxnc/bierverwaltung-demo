/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Application } from 'express';
import pg from 'pg';

// Einstellungen in der Tabelle appsettings (PostgreSQL) bzw. im Speicher (In-Memory-Datenbank)
// - import:stichtag  Stichtag des Mitglieder-Imports (JJJJ-MM-TT): Bankbuchungen bis dahin stecken im Übertrag
// - bank:accountIban IBAN des Bierkassen-Kontos, festgelegt beim ersten Bank-Import

export async function getSetting(app: Application, key: string): Promise<string | null> {
  const pool: pg.Pool | undefined = app.locals.pool;
  if (!pool) return (app.locals.settings as Map<string, string> | undefined)?.get(key) ?? null;
  const { rows } = await pool.query('SELECT "value" FROM "appsettings" WHERE "key" = $1', [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(app: Application, key: string, value: string): Promise<void> {
  const pool: pg.Pool | undefined = app.locals.pool;
  if (!pool) {
    app.locals.settings ??= new Map<string, string>();
    (app.locals.settings as Map<string, string>).set(key, value);
    return;
  }
  await pool.query(
    'INSERT INTO "appsettings" ("key", "value") VALUES ($1, $2) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"',
    [key, value]
  );
}
