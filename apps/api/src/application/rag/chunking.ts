/**
 * Chunking for retrieval.
 * - Semantic (variable-size) chunking: split where the embedding similarity between neighbouring
 *   sentences drops below a percentile threshold, so each chunk stays on one topic.
 * - Structural fallback when no embedding model is available: split on headings/paragraphs.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9"'(])|\n(?=#|- |\* |\d+\. )/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[index];
}

export interface ChunkOptions {
  /** Hard ceiling per chunk; a chunk is closed early when it would exceed it. */
  maxChars: number;
  /** Similarity drops in the lowest N percent become chunk boundaries. */
  breakpointPercentile: number;
}

export function semanticChunks(sentences: string[], embeddings: number[][], options: ChunkOptions = { maxChars: 900, breakpointPercentile: 25 }): string[] {
  if (sentences.length !== embeddings.length) throw new Error('Each sentence needs an embedding');
  if (sentences.length <= 1) return sentences;
  const similarities = sentences.slice(1).map((_, index) => cosine(embeddings[index], embeddings[index + 1]));
  const threshold = percentile(similarities, options.breakpointPercentile);
  const chunks: string[] = [];
  let current = sentences[0];
  for (let index = 1; index < sentences.length; index += 1) {
    const topicShift = similarities[index - 1] <= threshold;
    const tooLong = current.length + sentences[index].length + 1 > options.maxChars;
    if (topicShift || tooLong) {
      chunks.push(current);
      current = sentences[index];
    } else {
      current = `${current} ${sentences[index]}`;
    }
  }
  chunks.push(current);
  return chunks;
}

export function structuralChunks(text: string, maxChars = 900): string[] {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const block of blocks) {
    const startsSection = /^#{1,6}\s/.test(block);
    if (current && (startsSection || current.length + block.length + 2 > maxChars)) {
      chunks.push(current);
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) chunks.push(current);
  // Split any single block that is still too long at sentence boundaries.
  return chunks.flatMap((chunk) => (chunk.length <= maxChars ? [chunk] : splitLong(chunk, maxChars)));
}

function splitLong(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let current = '';
  for (const sentence of splitSentences(text)) {
    if (current && current.length + sentence.length + 1 > maxChars) {
      parts.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Reciprocal-rank fusion of several ranked id lists (k = 60, as in the original RRF paper). */
export function reciprocalRankFusion(rankings: string[][], k = 60): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  }
  return [...scores.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}
