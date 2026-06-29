import { HashingEmbedder, InMemoryVectorStore } from '@forgewright/embeddings';
import { VectorMemoryStore } from '@forgewright/memory';
import { beforeEach, describe, expect, it } from 'vitest';

import { HybridSearch } from './hybrid-search.js';

let memory: VectorMemoryStore;

beforeEach(async () => {
  let counter = 0;
  memory = new VectorMemoryStore({
    embedder: new HashingEmbedder(512),
    vectorStore: new InMemoryVectorStore('pkb'),
    generateId: () => `m${(counter += 1)}`,
    now: () => 0,
  });
  await memory.remember({
    kind: 'decision',
    content: 'We chose Qdrant for the vector database',
    tags: [],
    importance: 1,
  });
  await memory.remember({
    kind: 'preference',
    content: 'Prefer tabs over spaces for indentation',
    tags: [],
    importance: 1,
  });
  await memory.remember({
    kind: 'recurring-bug',
    content: 'Qdrant connection times out under load',
    tags: [],
    importance: 1,
  });
});

describe('HybridSearch', () => {
  it('fuses semantic and keyword retrieval and records signals', async () => {
    const search = new HybridSearch(memory);
    const results = await search.search('Qdrant vector database', { limit: 5 });

    const top = results[0];
    expect(top?.content).toContain('Qdrant');
    // Items found by keyword carry the keyword signal.
    const qdrantItems = results.filter((r) => r.content.includes('Qdrant'));
    expect(qdrantItems.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.signals.includes('keyword'))).toBe(true);
    expect(results.some((r) => r.signals.includes('semantic'))).toBe(true);
  });

  it('ranks an exact keyword match highly even with weak semantics', async () => {
    const search = new HybridSearch(memory);
    const results = await search.search('indentation', { limit: 3 });
    expect(results[0]?.content).toContain('indentation');
    expect(results[0]?.signals).toContain('keyword');
  });

  it('filters by kind', async () => {
    const search = new HybridSearch(memory);
    const results = await search.search('Qdrant', { kinds: ['recurring-bug'], limit: 5 });
    expect(results.every((r) => r.kind === 'recurring-bug')).toBe(true);
  });
});
