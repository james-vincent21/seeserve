-- Retrieval store for the owner assistant: documents, contextualized chunks, vectors + full text.
-- Requires the pgvector extension (docker image pgvector/pgvector:pg17).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('menu', 'policy', 'daily_summary', 'supplier_note', 'faq', 'other')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  -- Contextual retrieval: a short description situating the chunk within its document.
  context TEXT NOT NULL DEFAULT '',
  embedding vector(768),
  embedding_model TEXT,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', context || ' ' || content)) STORED,
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS document_chunks_tsv_idx ON document_chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);
