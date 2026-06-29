import { HashingEmbedder, InMemoryVectorStore } from '@forgewright/embeddings';
import { describe, expect, it } from 'vitest';

import { InMemoryKnowledgeGraph } from './knowledge-graph.js';
import { VectorMemoryStore } from './memory-store.js';

const makeStore = () => {
  let counter = 0;
  let time = 1000;
  return new VectorMemoryStore({
    embedder: new HashingEmbedder(512),
    vectorStore: new InMemoryVectorStore('memories'),
    generateId: () => `mem-${(counter += 1)}`,
    now: () => (time += 1),
  });
};

describe('VectorMemoryStore', () => {
  it('remembers and retrieves semantically relevant memories', async () => {
    const store = makeStore();
    await store.remember({
      kind: 'preference',
      content: 'I prefer tabs over spaces for indentation',
      tags: [],
      importance: 1,
    });
    await store.remember({
      kind: 'decision',
      content: 'We chose Fastify for the HTTP server',
      tags: [],
      importance: 1,
    });
    await store.remember({
      kind: 'recurring-bug',
      content: 'Null pointer when the user list is empty',
      tags: [],
      importance: 1,
    });

    const results = await store.retrieve({
      query: 'which web server framework did we pick',
      limit: 1,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toContain('Fastify');
  });

  it('filters retrieval by kind', async () => {
    const store = makeStore();
    await store.remember({
      kind: 'preference',
      content: 'use tabs for indentation',
      tags: [],
      importance: 1,
    });
    await store.remember({
      kind: 'todo',
      content: 'add indentation linting rule',
      tags: [],
      importance: 1,
    });

    const results = await store.retrieve({ query: 'indentation', limit: 5, kinds: ['todo'] });
    expect(results.every((m) => m.kind === 'todo')).toBe(true);
    expect(results.some((m) => m.content.includes('linting'))).toBe(true);
  });

  it('forgets a memory', async () => {
    const store = makeStore();
    const m = await store.remember({
      kind: 'todo',
      content: 'temporary note',
      tags: [],
      importance: 1,
    });
    expect(await store.all()).toHaveLength(1);
    await store.forget(m.id);
    expect(await store.all()).toHaveLength(0);
    expect(await store.retrieve({ query: 'temporary note', limit: 5 })).toHaveLength(0);
  });

  it('returns empty for an empty store', async () => {
    const store = makeStore();
    expect(await store.retrieve({ query: 'anything', limit: 5 })).toEqual([]);
  });
});

describe('InMemoryKnowledgeGraph', () => {
  const makeGraph = () => {
    let counter = 0;
    return new InMemoryKnowledgeGraph({ generateId: () => `e-${(counter += 1)}` });
  };

  it('adds entities and relations and traverses them', async () => {
    const graph = makeGraph();
    const project = await graph.addEntity({ type: 'project', name: 'Forgewright', properties: {} });
    const repo = await graph.addEntity({
      type: 'repository',
      name: 'forgewright-oss',
      properties: {},
    });
    const tech = await graph.addEntity({ type: 'technology', name: 'Fastify', properties: {} });

    await graph.addRelation({ from: project.id, to: repo.id, type: 'has-repo', weight: 1 });
    await graph.addRelation({ from: repo.id, to: tech.id, type: 'uses', weight: 1 });

    const depth1 = await graph.traverse({ startId: project.id, maxDepth: 1 });
    expect(depth1.map((e) => e.name)).toEqual(['forgewright-oss']);

    const depth2 = await graph.traverse({ startId: project.id, maxDepth: 2 });
    expect(depth2.map((e) => e.name).sort()).toEqual(['Fastify', 'forgewright-oss']);
  });

  it('restricts traversal by relation type', async () => {
    const graph = makeGraph();
    const a = await graph.addEntity({ type: 'person', name: 'A', properties: {} });
    const b = await graph.addEntity({ type: 'person', name: 'B', properties: {} });
    const c = await graph.addEntity({ type: 'person', name: 'C', properties: {} });
    await graph.addRelation({ from: a.id, to: b.id, type: 'knows', weight: 1 });
    await graph.addRelation({ from: a.id, to: c.id, type: 'blocks', weight: 1 });

    const knows = await graph.traverse({ startId: a.id, maxDepth: 1, relationTypes: ['knows'] });
    expect(knows.map((e) => e.name)).toEqual(['B']);
  });

  it('searches entities by name and type', async () => {
    const graph = makeGraph();
    await graph.addEntity({ type: 'technology', name: 'Fastify', properties: { lang: 'ts' } });
    await graph.addEntity({ type: 'technology', name: 'Qdrant', properties: {} });
    const results = await graph.search('fastify', 5);
    expect(results[0]?.name).toBe('Fastify');
  });
});
