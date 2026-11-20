import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cosine, reciprocalRankFusion, semanticChunks, splitSentences, structuralChunks } from '../apps/api/src/application/rag/chunking.js';

describe('Chunking', () => {
  it('splits sentences and paragraphs', () => {
    assert.deepEqual(splitSentences('First one. Second one!\n\nThird para.'), ['First one.', 'Second one!', 'Third para.']);
  });

  it('breaks semantic chunks where the topic changes', () => {
    const sentences = ['Kacchi is our signature.', 'It uses mutton.', 'Rent is due on the 1st.', 'Utilities are extra.'];
    // Two clear topics: food (x axis) and costs (y axis).
    const embeddings = [[1, 0], [0.95, 0.05], [0, 1], [0.05, 0.95]];
    assert.deepEqual(semanticChunks(sentences, embeddings, { maxChars: 500, breakpointPercentile: 10 }), [
      'Kacchi is our signature. It uses mutton.',
      'Rent is due on the 1st. Utilities are extra.',
    ]);
  });

  it('respects the maximum chunk size', () => {
    const sentences = ['a'.repeat(60), 'b'.repeat(60), 'c'.repeat(60)];
    const same = [[1, 0], [1, 0], [1, 0]];
    const chunks = semanticChunks(sentences, same, { maxChars: 130, breakpointPercentile: 0 });
    assert.ok(chunks.every((chunk) => chunk.length <= 130));
  });

  it('falls back to structural chunks on headings', () => {
    const chunks = structuralChunks('# Menu\n\nKacchi.\n\n# Policies\n\nNo smoking.', 900);
    assert.deepEqual(chunks, ['# Menu\n\nKacchi.', '# Policies\n\nNo smoking.']);
  });
});

describe('Hybrid retrieval helpers', () => {
  it('computes cosine similarity', () => {
    assert.equal(cosine([1, 0], [1, 0]), 1);
    assert.equal(cosine([1, 0], [0, 1]), 0);
  });

  it('fuses keyword and vector rankings, rewarding agreement', () => {
    const fused = reciprocalRankFusion([['a', 'b', 'c'], ['b', 'd']]);
    assert.equal(fused[0].id, 'b');
    assert.equal(fused.length, 4);
  });
});
