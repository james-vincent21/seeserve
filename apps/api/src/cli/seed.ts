import { env } from '../config/env.js';
import { runMigrations } from '../infrastructure/database/migrate.js';
import { seedDatabase } from '../infrastructure/seed/seed.js';
import { buildCorpus } from '../application/rag/corpus.js';
import { container } from '../container.js';

const { pool } = container;
try {
  await runMigrations(pool);
  const summary = await seedDatabase(pool, { adminEmails: env.ADMIN_EMAILS });
  console.log('[seed] synthetic data loaded', summary);

  const localModels = await container.ollama.available();
  console.log(`[seed] building retrieval corpus (${localModels ? 'Ollama online: semantic chunks, LLM context, embeddings' : 'Ollama offline: structural chunks, keyword index only'})`);
  const reports = await buildCorpus(container.rag, { menu: await container.hub.menu(), analytics: container.analyticsRepository });
  const ingested = reports.filter((report) => report.status === 'ingested');
  console.log(`[seed] corpus: ${ingested.length} documents ingested, ${reports.length - ingested.length} unchanged, `
    + `${ingested.reduce((sum, report) => sum + report.chunks, 0)} chunks`, await container.rag.stats());
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
