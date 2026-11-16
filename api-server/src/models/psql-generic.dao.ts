/* Autor: Prof. Dr. Norman Lahme-Hütig (FH Münster) */

import { v4 as uuidv4 } from 'uuid';
import { Client, Pool, PoolClient } from 'pg';
import { Entity } from './entity.js';
import { GenericDAO } from './generic.dao.js';

export class PsqlGenericDAO<T extends Entity> implements GenericDAO<T> {
  constructor(
    private db: Client | Pool | PoolClient, // PoolClient: innerhalb einer Transaktion (utils/transaction.ts)
    private table: string
  ) {}

  public async create(partEntity: Omit<T, keyof Entity>) {
    const entity = { ...partEntity, id: uuidv4(), createdAt: new Date().getTime() };

    const keys = Object.keys(entity);
    const values = keys.map(k => toParamValue(entity[k as keyof typeof entity]));
    const columns = keys.map(toColumnName).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    await this.db.query(`INSERT INTO ${this.table} (${columns}) VALUES (${placeholders})`, values);
    return entity as T;
  }

  public async findAll(entityFilter?: Partial<T>) {
    const { clause, values } = buildWhereClause(entityFilter);
    const result = await this.db.query(`SELECT * FROM ${this.table} ${clause} ORDER BY "createdAt" DESC`, values);
    return result.rows as T[];
  }

  public async findOne(entityFilter: Partial<T>) {
    const { clause, values } = buildWhereClause(entityFilter);
    const result = await this.db.query(`SELECT * FROM ${this.table} ${clause} LIMIT 1`, values);
    return (result.rows[0] as T) ?? null;
  }

  public async update(entity: Partial<T> & Pick<Entity, 'id'>) {
    const { id, ...fields } = entity;
    const keys = Object.keys(fields);
    // Ohne zu setzende Felder gäbe es ein leeres SET (SQL-Syntaxfehler) – nichts zu tun.
    if (keys.length === 0) {
      return false;
    }
    const values = keys.map(k => toParamValue(fields[k as keyof typeof fields]));
    const set = keys.map((k, i) => `${toColumnName(k)} = $${i + 1}`).join(', ');

    await this.db.query(`UPDATE ${this.table} SET ${set} WHERE "id" = $${keys.length + 1}`, [...values, id]);
    return true;
  }

  public async delete(id: string) {
    await this.db.query(`DELETE FROM ${this.table} WHERE "id" = $1`, [id]);
    return true;
  }

  public async deleteAll(entityFilter?: Partial<T>) {
    const { clause, values } = buildWhereClause(entityFilter);
    const result = await this.db.query(`DELETE FROM ${this.table} ${clause}`, values);
    return result.rowCount || 0;
  }
}

function toColumnName(propertyName: string) {
  return `"${propertyName}"`;
}

function toParamValue(value: unknown): unknown {
  if (Array.isArray(value) || (typeof value === 'object' && value !== null && !(value instanceof Date))) {
    return JSON.stringify(value);
  }
  return value;
}

function buildWhereClause<T extends Entity>(entityFilter?: Partial<T>): { clause: string; values: unknown[] } {
  if (!entityFilter || !Object.keys(entityFilter).length) {
    return { clause: '', values: [] };
  }
  const keys = Object.keys(entityFilter);
  const values = keys.map(k => toParamValue(entityFilter[k as keyof T]));
  const clause = 'WHERE ' + keys.map((k, i) => `${toColumnName(k)} = $${i + 1}`).join(' AND ');
  return { clause, values };
}
