import { loadConfig } from '@forgewright/shared';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { buildContainer } from '../container.js';

const buildTestApp = () => buildContainer(loadConfig({ env: {}, cwd: process.cwd() }));

describe('memory routes', () => {
  it('stores, searches, lists, and forgets memories', async () => {
    const app = buildApp({ container: buildTestApp() });
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/memory',
        payload: {
          kind: 'decision',
          content: 'We chose Qdrant for the vector store',
          importance: 2,
        },
      });
      expect(created.statusCode).toBe(201);
      const memory = created.json();
      expect(memory.id).toBeTruthy();
      expect(memory.kind).toBe('decision');

      const search = await app.inject({
        method: 'GET',
        url: '/memory/search?q=which%20vector%20database',
      });
      expect(search.statusCode).toBe(200);
      const results = search.json().results as { content: string }[];
      expect(results.some((r) => r.content.includes('Qdrant'))).toBe(true);

      const list = await app.inject({ method: 'GET', url: '/memory' });
      expect((list.json().memories as unknown[]).length).toBe(1);

      const del = await app.inject({ method: 'DELETE', url: `/memory/${memory.id}` });
      expect(del.statusCode).toBe(204);

      const after = await app.inject({ method: 'GET', url: '/memory' });
      expect((after.json().memories as unknown[]).length).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('rejects a memory with no content', async () => {
    const app = buildApp({ container: buildTestApp() });
    try {
      const res = await app.inject({ method: 'POST', url: '/memory', payload: { kind: 'todo' } });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
