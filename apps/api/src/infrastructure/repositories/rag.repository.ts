import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

export type SourceType = 'menu' | 'policy' | 'daily_summary' | 'supplier_note' | 'faq' | 'other';

export interface ChunkHit {
  id: string;
  documentId: string;
  title: string;
  sourceType: SourceType;
  content: string;
  context: string;
}

const toVector = (embedding: number[]) => `[${embedding.join(',')}]`;

export class RagRepository {
  constructor(private readonly db: Pool) {}

  static hash(body: string): string {
    return createHash('sha256').update(body).digest('hex');
  }

  /** Inserts the document unless identical content already exists. Returns the new id, or null if unchanged. */
  async upsertDocument(doc: { sourceType: SourceType; title: string; body: string; metadata?: Record<string, unknown> }): Promise<string | null> {
    const contentHash = RagRepository.hash(`${doc.title}\n${doc.body}`);
    const { rows } = await this.db.query(
      `INSERT INTO documents (source_type, title, body, content_hash, metadata) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (content_hash) DO NOTHING RETURNING id`,
      [doc.sourceType, doc.title, doc.body, contentHash, JSON.stringify(doc.metadata ?? {})],
    );
    return rows[0]?.id ?? null;
  }

  /** Removes older documents with the same title (e.g. a regenerated menu) once a new version is stored. */
  async deleteOtherVersions(title: string, keepId: string): Promise<void> {
    await this.db.query('DELETE FROM documents WHERE title = $1 AND id <> $2', [title, keepId]);
  }

  async insertChunks(documentId: string, chunks: Array<{ content: string; context: string; embedding: number[] | null }>, embeddingModel: string | null): Promise<void> {
    for (const [index, chunk] of chunks.entries()) {
      await this.db.query(
        `INSERT INTO document_chunks (document_id, chunk_index, content, context, embedding, embedding_model)
         VALUES ($1,$2,$3,$4,$5::vector,$6)`,
        [documentId, index, chunk.content, chunk.context, chunk.embedding ? toVector(chunk.embedding) : null, chunk.embedding ? embeddingModel : null],
      );
    }
  }

  async keywordSearch(query: string, limit: number, sourceTypes?: SourceType[]): Promise<ChunkHit[]> {
    const { rows } = await this.db.query(
      `SELECT c.id, c.document_id, d.title, d.source_type, c.content, c.context
       FROM document_chunks c JOIN documents d ON d.id = c.document_id,
            websearch_to_tsquery('english', $1) q
       WHERE c.tsv @@ q AND ($3::text[] IS NULL OR d.source_type = ANY($3))
       ORDER BY ts_rank_cd(c.tsv, q) DESC LIMIT $2`,
      [query, limit, sourceTypes ?? null],
    );
    return rows.map(toHit);
  }

  async vectorSearch(embedding: number[], limit: number, sourceTypes?: SourceType[]): Promise<ChunkHit[]> {
    const { rows } = await this.db.query(
      `SELECT c.id, c.document_id, d.title, d.source_type, c.content, c.context
       FROM document_chunks c JOIN documents d ON d.id = c.document_id
       WHERE c.embedding IS NOT NULL AND ($3::text[] IS NULL OR d.source_type = ANY($3))
       ORDER BY c.embedding <=> $1::vector LIMIT $2`,
      [toVector(embedding), limit, sourceTypes ?? null],
    );
    return rows.map(toHit);
  }

  async stats(): Promise<{ documents: number; chunks: number; embedded: number }> {
    const { rows } = await this.db.query(
      `SELECT (SELECT count(*) FROM documents)::int AS documents, count(*)::int AS chunks, count(embedding)::int AS embedded FROM document_chunks`,
    );
    return rows[0];
  }
}

function toHit(row: { id: string; document_id: string; title: string; source_type: SourceType; content: string; context: string }): ChunkHit {
  return { id: row.id, documentId: row.document_id, title: row.title, sourceType: row.source_type, content: row.content, context: row.context };
}
