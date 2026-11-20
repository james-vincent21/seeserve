import { pool } from '../infrastructure/database/pool.js';
import { runMigrations } from '../infrastructure/database/migrate.js';

try {
  await runMigrations(pool);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
