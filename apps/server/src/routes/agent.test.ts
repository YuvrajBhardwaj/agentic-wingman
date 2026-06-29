import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DefaultModelRouter, FakeLlmProvider, textChunks, toolCallChunks } from '@forgewright/llm';
import { loadConfig, TOKENS } from '@forgewright/shared';
import type { ModelRole } from '@forgewright/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { buildContainer } from '../container.js';

const ROUTES: Record<ModelRole, string> = {
  cheap: 'fake',
  coding: 'fake',
  reasoning: 'fake',
  verification: 'fake',
};

/** Parse an SSE payload into a list of { event, data } records. */
const parseSse = (payload: string): { event: string; data: unknown }[] =>
  payload
    .split('\n\n')
    .filter((f) => f.trim() !== '')
    .map((frame) => {
      const lines = frame.split('\n');
      const event =
        lines
          .find((l) => l.startsWith('event:'))
          ?.slice(6)
          .trim() ?? '';
      const dataLine =
        lines
          .find((l) => l.startsWith('data:'))
          ?.slice(5)
          .trim() ?? 'null';
      return { event, data: JSON.parse(dataLine) as unknown };
    });

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'wingman-server-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const buildTestApp = () => {
  const config = loadConfig({ env: {}, cwd: root });
  const container = buildContainer(config);
  const provider = new FakeLlmProvider(
    [toolCallChunks('list_dir', { path: '.' }), textChunks('Listed the directory.')],
    'fake',
  );
  container.registerValue(TOKENS.ModelRouter, new DefaultModelRouter([provider], ROUTES));
  return buildApp({ container });
};

describe('POST /agent/runs', () => {
  it('streams agent events as SSE for a read-only task', async () => {
    const app = buildTestApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/agent/runs',
        payload: { input: 'list the files' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      const events = parseSse(res.payload);
      const eventTypes = events.map((e) => e.event);
      expect(eventTypes).toContain('run_started');
      expect(eventTypes).toContain('step');
      expect(eventTypes).toContain('tool_call');
      expect(eventTypes).toContain('tool_result');

      const done = events.find((e) => e.event === 'done')?.data as { reason?: string } | undefined;
      expect(done?.reason).toBe('completed');
    } finally {
      await app.close();
    }
  });

  it('rejects a run with no input', async () => {
    const app = buildTestApp();
    try {
      const res = await app.inject({ method: 'POST', url: '/agent/runs', payload: {} });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('returns 404 when approving an unknown run', async () => {
    const app = buildTestApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/agent/runs/nope/approvals/appr_1',
        payload: { approved: true },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
