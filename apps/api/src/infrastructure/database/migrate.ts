import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

/** SQL files live in src/; when running from dist/ fall back to the source folder. */
function migrationsDir(): string {
  const candidates = [
    fileURLToPath(new URL('./migrations/', import.meta.url)),
    fileURLToPath(new URL('../../../src/infrastructure/database/migrations/', import.meta.url)),
  ];
  const found = candidates.find((dir) => existsSync(dir));
  if (!found) throw new Error('Migrations folder not found');
  return found;
}

/**
 * Applies each *.sql file once, in name order, inside a transaction.
 * Every migration is written to be idempotent, so databases created by the Docker init
 * script (which ran 001 without recording it) are handled safely.
 */
export async function runMigrations(db: Pool, log: (line: string) => void = console.log): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const applied = new Set(
    (await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((row) => row.name),
  );
  const dir = migrationsDir();
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(readFileSync(`${dir}${file}`, 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      newlyApplied.push(file);
      log(`[migrate] applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      client.release();
    }
  }
  if (newlyApplied.length === 0) log('[migrate] database is up to date');
  return newlyApplied;
}
