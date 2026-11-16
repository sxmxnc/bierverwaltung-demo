/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Application } from 'express';
import pg from 'pg';
import { GenericDAO } from '../models/generic.dao.js';
import { InventoryItem } from '../models/inventory.js';
import { BankIban, BankImport, BankTransactionRecord } from '../models/bank.js';
import { Order } from '../models/order.js';
import { Payment } from '../models/payment.js';
import { PsqlGenericDAO } from '../models/psql-generic.dao.js';
import { TallyAlias, TallyImport } from '../models/tally-import.js';
import { User } from '../models/user-auth.js';

export interface BookingDaos {
  orderDao: GenericDAO<Order>;
  inventoryDao: GenericDAO<InventoryItem>;
  tallyImportDao: GenericDAO<TallyImport>;
  tallyAliasDao: GenericDAO<TallyAlias>;
  userDao: GenericDAO<User>;
  paymentDao: GenericDAO<Payment>;
  bankImportDao: GenericDAO<BankImport>;
  bankTransactionDao: GenericDAO<BankTransactionRecord>;
  bankIbanDao: GenericDAO<BankIban>;
}

// Mehrere Buchungen ganz oder gar nicht: Mit PostgreSQL laufen alle Schritte in einer Transaktion,
// bei einem Fehler wird alles zurückgerollt. Die In-Memory-Datenbank (nur Entwicklung) kennt keine Transaktionen.
export async function withBookingTransaction<T>(app: Application, work: (daos: BookingDaos) => Promise<T>): Promise<T> {
  const pool: pg.Pool | undefined = app.locals.pool;
  if (!pool) {
    return work({
      orderDao: app.locals.orderDao,
      inventoryDao: app.locals.inventoryDao,
      tallyImportDao: app.locals.tallyImportDao,
      tallyAliasDao: app.locals.tallyAliasDao,
      userDao: app.locals.userDao,
      paymentDao: app.locals.paymentDao,
      bankImportDao: app.locals.bankImportDao,
      bankTransactionDao: app.locals.bankTransactionDao,
      bankIbanDao: app.locals.bankIbanDao
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work({
      orderDao: new PsqlGenericDAO<Order>(client, 'orders'),
      inventoryDao: new PsqlGenericDAO<InventoryItem>(client, 'inventoryitems'),
      tallyImportDao: new PsqlGenericDAO<TallyImport>(client, 'tallyimports'),
      tallyAliasDao: new PsqlGenericDAO<TallyAlias>(client, 'tallyaliases'),
      userDao: new PsqlGenericDAO<User>(client, 'users'),
      paymentDao: new PsqlGenericDAO<Payment>(client, 'payments'),
      bankImportDao: new PsqlGenericDAO<BankImport>(client, 'bankimports'),
      bankTransactionDao: new PsqlGenericDAO<BankTransactionRecord>(client, 'banktransactions'),
      bankIbanDao: new PsqlGenericDAO<BankIban>(client, 'bankibans')
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
