import { DefaultModelRouter } from '@forgewright/llm';
import { loadConfig, TOKENS } from '@forgewright/shared';
import type { ChatChunk, ChatRequest, LlmProvider, ModelRole } from '@forgewright/types';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { buildContainer } from '../container.js';

const ROUTES: Record<ModelRole, string> = {
  cheap: 'fake',
  coding: 'fake',
  reasoning: 'fake',
  verification: 'fake',
};

class AlwaysProvider implements LlmProvider {
  readonly id = 'fake';
  readonly info = { id: 'fake', contextWindow: 8192 };
  async *chat(_request: ChatRequest): AsyncIterable<ChatChunk> {
    yield { type: 'text', delta: 'a contribution.' };
    yield { type: 'done', finishReason: 'stop' };
  }
}

let app: ReturnType<typeof buildApp> | undefined;
const makeApp = () => {
  const container = buildContainer(loadConfig({ env: {}, cwd: process.cwd() }));
  container.registerValue(
    TOKENS.ModelRouter,
    new DefaultModelRouter([new AlwaysProvider()], ROUTES),
  );
  app = buildApp({ container });
  return app;
};

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

describe('platform routes', () => {
  it('lists multi-agent roles', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/agents/roles' });
    expect(res.statusCode).toBe(200);
    expect(res.json().roles).toContain('software-engineer');
  });

  it('runs a multi-agent collaboration', async () => {
    const res = await makeApp().inject({
      method: 'POST',
      url: '/agents/collaborate',
      payload: { goal: 'design a feature', agents: ['planner', 'reviewer'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contributions).toHaveLength(2);
    expect(typeof body.synthesis).toBe('string');
  });

  it('parses an uploaded document (base64)', async () => {
    const res = await makeApp().inject({
      method: 'POST',
      url: '/documents/parse',
      payload: { filename: 'data.csv', base64: Buffer.from('a,b\n1,2').toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().document.tables[0].headers).toEqual(['a', 'b']);
  });

  it('lists supported document formats', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/documents/formats' });
    expect(res.json().extensions).toContain('xlsx');
  });

  it('hybrid-searches the knowledge base', async () => {
    const application = makeApp();
    await application.inject({
      method: 'POST',
      url: '/memory',
      payload: { kind: 'decision', content: 'We adopted Fastify for the API' },
    });
    const res = await application.inject({
      method: 'GET',
      url: '/pkb/search?q=which%20web%20framework',
    });
    expect(res.statusCode).toBe(200);
    const results = res.json().results as { content: string }[];
    expect(results.some((r) => r.content.includes('Fastify'))).toBe(true);
  });

  it('lists integrations (empty without configured credentials)', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/integrations' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().integrations)).toBe(true);
  });
});
