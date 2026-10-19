import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import fs from 'fs';
import path from 'path';
import { env } from './env';
import { log } from './log';

// Return DATE columns as plain 'YYYY-MM-DD' strings (no timezone shifting).
types.setTypeParser(1082, (v: string) => v);
// Return bigint counts as numbers.
types.setTypeParser(20, (v: string) => Number(v));

let pool: Pool | null = null;
let healthy = false;
let lastError = '';
let migrated = false;

export class DbUnavailableError extends Error {
  constructor() { super('The database is not reachable right now. Please try again in a minute.'); }
}

export function getPool(): Pool {
  if (!pool) {
    if (!env.databaseUrl) throw new DbUnavailableError();
    pool = new Pool({
      connectionString: env.databaseUrl,
      max: 10,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30000,
    });
    // An idle client error must never crash the app.
    pool.on('error', (err) => {
      healthy = false;
      lastError = err.message;
      log.error('db', 'Idle connection error', err);
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []) {
  try {
    const res = await getPool().query<T>(text, params);
    healthy = true;
    return res;
  } catch (err: any) {
    if (isConnectionError(err)) {
      healthy = false;
      lastError = err.message;
      throw new DbUnavailableError();
    }
    throw err;
  }
}

export async function one<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const res = await query<T>(text, params);
  return res.rows[0] ?? null;
}

export async function many<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await query<T>(text, params);
  return res.rows;
}

export async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (err: any) {
    healthy = false;
    lastError = err.message;
    throw new DbUnavailableError();
  }
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (c) => {
    await c.query('BEGIN');
    try {
      const r = await fn(c);
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    }
  });
}

function isConnectionError(err: any): boolean {
  const code = String(err?.code || '');
  return (
    err instanceof DbUnavailableError ||
    ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', '57P01', '57P03', '08006', '08001', '08003'].includes(code) ||
    /Connection terminated|timeout exceeded when trying to connect/i.test(String(err?.message))
  );
}

export async function pingDb(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    healthy = true;
    return true;
  } catch (err: any) {
    healthy = false;
    lastError = err?.message || String(err);
    return false;
  }
}

export function dbStatus() {
  return { healthy, migrated, lastError: healthy ? '' : lastError };
}

function migrationsDir(): string {
  const candidates = [
    path.join(__dirname, '..', 'migrations'),       // dist/migrations
    path.join(__dirname, '..', '..', 'migrations'), // backend/migrations (dev)
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('Could not find the migrations folder');
}

/** Runs every migrations/NNN_name.sql file that hasn't been applied yet. */
export async function migrate(): Promise<void> {
  const dir = migrationsDir();
  const files = fs.readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  await withClient(async (c) => {
    await c.query('SELECT pg_advisory_lock(727001)');
    try {
      await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
      for (const f of files) {
        if (done.has(f)) continue;
        const sql = fs.readFileSync(path.join(dir, f), 'utf8');
        await c.query('BEGIN');
        try {
          await c.query(sql);
          await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
          await c.query('COMMIT');
          log.info('db', `Applied migration ${f}`);
        } catch (e) {
          await c.query('ROLLBACK');
          throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
        }
      }
    } finally {
      await c.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    }
  });
  migrated = true;
  healthy = true;
}

export function isReady() { return healthy && migrated; }
