import type { OllamaClient } from '../../infrastructure/ai/ollama.js';
import type { ChunkHit, RagRepository, SourceType } from '../../infrastructure/repositories/rag.repository.js';
import { renderPrompt } from '../chat/prompts.js';
import { reciprocalRankFusion, semanticChunks, splitSentences, structuralChunks } from './chunking.js';

export type RagStore = Pick<RagRepository, keyof RagRepository>;

/**
 * Contextual-retrieval prompt from prompts/chunk-context.md (after Anthropic's "Contextual Retrieval"
 * method), run on a local model. The file's first line is the system instruction.
 */
function contextRequest(title: string, document: string, chunk: string): { system: string; prompt: string } {
  const [systemLine, ...rest] = renderPrompt('chunk-context', { title, document: document.slice(0, 6000), chunk }).split('\n');
  return { system: systemLine.replace(/^System:\s*/, ''), prompt: rest.join('\n').trim() };
}

export interface SearchResult extends ChunkHit {
  score: number;
  matchedBy: Array<'keyword' | 'vector'>;
}

export interface IngestReport {
  title: string;
  status: 'ingested' | 'unchanged';
  chunks: number;
  chunking: 'semantic' | 'structural';
  context: 'llm' | 'heuristic';
  embedded: boolean;
}

/**
 * Hybrid retrieval over restaurant documents:
 * semantic chunking → contextual prefix per chunk → local embeddings (pgvector) + full-text index,
 * fused at query time with reciprocal-rank fusion. Degrades to keyword-only search without Ollama.
 */
export class RagService {
  constructor(private readonly store: RagStore, private readonly ollama: OllamaClient) {}

  async ingest(doc: { sourceType: SourceType; title: string; body: string; metadata?: Record<string, unknown>; replaceByTitle?: boolean }): Promise<IngestReport> {
    const documentId = await this.store.upsertDocument(doc);
    if (!documentId) return { title: doc.title, status: 'unchanged', chunks: 0, chunking: 'structural', context: 'heuristic', embedded: false };
    if (doc.replaceByTitle) await this.store.deleteOtherVersions(doc.title, documentId);

    const local = await this.ollama.available();
    let pieces: string[];
    let chunking: IngestReport['chunking'] = 'structural';
    if (local) {
      try {
        const sentences = splitSentences(doc.body);
        const sentenceVectors = await this.ollama.embed(sentences);
        pieces = semanticChunks(sentences, sentenceVectors);
        chunking = 'semantic';
      } catch {
        pieces = structuralChunks(doc.body);
      }
    } else {
      pieces = structuralChunks(doc.body);
    }

    let contextMode: IngestReport['context'] = 'heuristic';
    const contexts: string[] = [];
    for (const piece of pieces) {
      let context = `From "${doc.title}" (${doc.sourceType.replace('_', ' ')}).`;
      if (local && pieces.length > 1) {
        try {
          const request = contextRequest(doc.title, doc.body, piece);
          const generated = await this.ollama.generate(request.prompt, { system: request.system, maxTokens: 60 });
          if (generated) {
            context = `${context} ${generated}`;
            contextMode = 'llm';
          }
        } catch {
          // keep the heuristic context
        }
      }
      contexts.push(context);
    }

    let embeddings: Array<number[] | null> = pieces.map(() => null);
    if (local) {
      try {
        embeddings = await this.ollama.embed(pieces.map((piece, index) => `${contexts[index]}\n${piece}`));
      } catch {
        // keyword search still works for these chunks
      }
    }
    await this.store.insertChunks(documentId, pieces.map((content, index) => ({ content, context: contexts[index], embedding: embeddings[index] })), this.ollama.embedModel);
    return { title: doc.title, status: 'ingested', chunks: pieces.length, chunking, context: contextMode, embedded: embeddings.some(Boolean) };
  }

  async search(query: string, options: { limit?: number; sourceTypes?: SourceType[] } = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 6;
    const candidates = limit * 3;
    const keyword = await this.store.keywordSearch(query, candidates, options.sourceTypes);
    let vector: ChunkHit[] = [];
    if (await this.ollama.available()) {
      try {
        const [embedding] = await this.ollama.embed([query]);
        vector = await this.store.vectorSearch(embedding, candidates, options.sourceTypes);
      } catch {
        vector = [];
      }
    }
    const byId = new Map<string, ChunkHit>([...keyword, ...vector].map((hit) => [hit.id, hit]));
    const keywordIds = new Set(keyword.map((hit) => hit.id));
    const vectorIds = new Set(vector.map((hit) => hit.id));
    return reciprocalRankFusion([keyword.map((hit) => hit.id), vector.map((hit) => hit.id)])
      .slice(0, limit)
      .map(({ id, score }) => ({
        ...byId.get(id)!,
        score: Math.round(score * 10_000) / 10_000,
        matchedBy: [...(keywordIds.has(id) ? ['keyword' as const] : []), ...(vectorIds.has(id) ? ['vector' as const] : [])],
      }));
  }

  stats() {
    return this.store.stats();
  }
}
