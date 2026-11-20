/**
 * Docker-free development database: PGlite (Postgres compiled to WebAssembly) with pgvector and
 * pgcrypto, served over the normal Postgres wire protocol on localhost:5433, so the API connects with
 * the same DATABASE_URL as the Docker setup. Data persists in ./data/pglite (gitignored).
 *
 *   npm run db:lite      # then, in another terminal: npm run db:seed && npm run dev
 *
 * For production-like testing prefer `npm run db:up` (real PostgreSQL 17 + pgvector in Docker).
 */
import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const dataDir = process.env.PGLITE_DATA_DIR ?? './data/pglite';
const port = Number(process.env.PGLITE_PORT ?? 5433);
mkdirSync(dataDir, { recursive: true });

const db = await PGlite.create({ dataDir, extensions: { vector, pgcrypto } });
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
await server.start();
console.log(`[db:lite] PGlite (pgvector + pgcrypto) listening on 127.0.0.1:${port}, data in ${dataDir}`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
