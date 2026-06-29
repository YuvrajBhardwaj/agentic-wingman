import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DefaultModelRouter, FakeLlmProvider, textChunks, toolCallChunks } from '@forgewright/llm';
import { loadConfig, MemorySink, StructuredLogger } from '@forgewright/shared';
import type {
  AgentEvent,
  ChatChunk,
  ChatRequest,
  LlmModelInfo,
  LlmProvider,
  ModelRole,
} from '@forgewright/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgent } from './factory.js';

const ROUTES: Record<ModelRole, string> = {
  cheap: 'fake',
  coding: 'fake',
  reasoning: 'fake',
  verification: 'fake',
};

const logger = new StructuredLogger({ sink: new MemorySink() });

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'wingman-agent-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const collect = async (iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> => {
  const out: AgentEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
};

describe('AgentLoop', () => {
  it('runs a tool call and feeds the result back to completion', async () => {
    const provider = new FakeLlmProvider(
      [
        toolCallChunks('write_file', { path: 'hello.ts', content: 'export const hi = 1;\n' }),
        textChunks('Created hello.ts.'),
      ],
      'fake',
    );
    const router = new DefaultModelRouter([provider], ROUTES);
    const config = loadConfig({ env: {}, cwd: root });
    const { agent } = createAgent({ config, logger, router, approver: async () => true });

    const events = await collect(agent.run({ conversationId: 'c1', input: 'create hello.ts' }));

    const types = events.map((e) => e.type);
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult?.type === 'tool_result' && toolResult.isError).toBe(false);

    const written = await readFile(join(root, 'hello.ts'), 'utf8');
    expect(written).toBe('export const hi = 1;\n');

    expect(events.at(-1)).toEqual({ type: 'done', reason: 'completed' });

    // The second turn should have seen the tool result message.
    expect(provider.requests).toHaveLength(2);
    const secondTurn = provider.requests[1] as ChatRequest;
    expect(secondTurn.messages.some((m) => m.role === 'tool')).toBe(true);
  });

  it('reports an error result when a tool is denied, without throwing', async () => {
    const provider = new FakeLlmProvider(
      [
        toolCallChunks('write_file', { path: 'nope.ts', content: 'x' }),
        textChunks('I could not write the file.'),
      ],
      'fake',
    );
    const router = new DefaultModelRouter([provider], ROUTES);
    const config = loadConfig({ env: {}, cwd: root });
    const { agent } = createAgent({ config, logger, router, approver: async () => false });

    const events = await collect(agent.run({ conversationId: 'c1', input: 'write nope.ts' }));
    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult?.type === 'tool_result' && toolResult.isError).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'completed' });
  });

  it('stops after the configured max steps', async () => {
    // A provider that always asks to read a file -> never terminates on its own.
    const alwaysTool: LlmProvider = {
      id: 'loop',
      info: { id: 'loop', contextWindow: 8192 } satisfies LlmModelInfo,
      async *chat(): AsyncIterable<ChatChunk> {
        yield {
          type: 'tool_call',
          call: { id: 'call_0', name: 'list_dir', arguments: '{"path":"."}' },
        };
        yield { type: 'done', finishReason: 'tool_calls' };
      },
    };
    const router = new DefaultModelRouter([alwaysTool], ROUTES);
    const config = loadConfig({ env: {}, cwd: root });
    const { agent } = createAgent({ config, logger, router, approver: async () => true });

    const events = await collect(
      agent.run({ conversationId: 'c1', input: 'loop forever', maxSteps: 3 }),
    );
    const steps = events.filter((e) => e.type === 'step');
    expect(steps).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'max_steps' });
  });

  it('aborts promptly when the signal is already aborted', async () => {
    const provider = new FakeLlmProvider([textChunks('hi')], 'fake');
    const router = new DefaultModelRouter([provider], ROUTES);
    const config = loadConfig({ env: {}, cwd: root });
    const { agent } = createAgent({ config, logger, router, approver: async () => true });

    const controller = new AbortController();
    controller.abort();
    const events = await collect(
      agent.run({ conversationId: 'c1', input: 'do work', signal: controller.signal }),
    );
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'aborted' });
  });
});
