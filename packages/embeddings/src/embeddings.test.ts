import { describe, expect, it } from 'vitest';

import { HashingEmbedder } from './hashing-embedder.js';
import { InMemoryVectorStore } from './in-memory-vector-store.js';
import { cosineSimilarity } from './vector-math.js';

describe('HashingEmbedder', () => {
  it('produces deterministic, fixed-dimension, normalized vectors', async () => {
    const embedder = new HashingEmbedder(384);
    const [a] = await embedder.embed(['the quick brown fox']);
    const [b] = await embedder.embed(['the quick brown fox']);
    expect(a).toHaveLength(384);
    expect(a).toEqual(b); // deterministic
    const mag = Math.sqrt((a as number[]).reduce((s, x) => s + x * x, 0));
    expect(mag).toBeCloseTo(1, 5); // normalized
  });

  it('places related texts closer than unrelated ones', async () => {
    const embedder = new HashingEmbedder(512);
    const [login, auth, weather] = await embedder.embed([
      'user login authentication flow',
      'authenticate a user when they log in',
      'tomorrow the weather will be sunny and warm',
    ]);
    const related = cosineSimilarity(login as number[], auth as number[]);
    const unrelated = cosineSimilarity(login as number[], weather as number[]);
    expect(related).toBeGreaterThan(unrelated);
  });
});

describe('InMemoryVectorStore', () => {
  it('returns nearest neighbors by cosine similarity', async () => {
    const embedder = new HashingEmbedder(256);
    const store = new InMemoryVectorStore('mem');
    const docs = [
      { id: '1', text: 'how to configure the database connection' },
      { id: '2', text: 'database connection pooling settings' },
      { id: '3', text: 'a recipe for chocolate chip cookies' },
    ];
    const vectors = await embedder.embed(docs.map((d) => d.text));
    await store.upsert(
      docs.map((d, i) => ({ id: d.id, vector: vectors[i] as number[], payload: { text: d.text } })),
    );
    expect(await store.count()).toBe(3);

    const [q] = await embedder.embed(['configure db connection pool']);
    const results = await store.query({ vector: q as number[], limit: 2 });
    expect(results.map((r) => r.id)).toEqual(expect.arrayContaining(['1', '2']));
    expect(results).toHaveLength(2);
    expect(results[0]?.score).toBeGreaterThanOrEqual(results[1]?.score ?? 0);
  });

  it('applies payload equality filters', async () => {
    const embedder = new HashingEmbedder(128);
    const store = new InMemoryVectorStore();
    const [v1, v2] = await embedder.embed(['alpha', 'beta']);
    await store.upsert([
      { id: 'a', vector: v1 as number[], payload: { kind: 'note' } },
      { id: 'b', vector: v2 as number[], payload: { kind: 'todo' } },
    ]);
    const results = await store.query({
      vector: v1 as number[],
      limit: 10,
      filter: { kind: 'todo' },
    });
    expect(results.map((r) => r.id)).toEqual(['b']);
  });

  it('deletes records', async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([{ id: 'x', vector: [1, 0], payload: {} }]);
    await store.delete(['x']);
    expect(await store.count()).toBe(0);
  });
});
