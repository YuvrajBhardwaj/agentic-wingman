import type { ChatChunk } from '@forgewright/types';
import { describe, expect, it } from 'vitest';

import { OllamaProvider } from './ollama-provider.js';

const ndjsonResponse = (lines: readonly string[]): Response => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
};

const collect = async (iter: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> => {
  const out: ChatChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
};

describe('OllamaProvider', () => {
  it('streams text and emits usage on done', async () => {
    const fetchImpl = (async () =>
      ndjsonResponse([
        '{"message":{"content":"Hi"},"done":false}\n',
        '{"message":{"content":" there"},"done":false}\n',
        '{"message":{"content":""},"done":true,"prompt_eval_count":7,"eval_count":3}\n',
      ])) as unknown as typeof fetch;

    const provider = new OllamaProvider({ id: 'o', baseUrl: 'http://x', model: 'm', fetchImpl });
    const chunks = await collect(provider.chat({ messages: [{ role: 'user', content: 'hi' }] }));
    const text = chunks
      .filter((c): c is Extract<ChatChunk, { type: 'text' }> => c.type === 'text')
      .map((c) => c.delta)
      .join('');
    expect(text).toBe('Hi there');
    const usage = chunks.find(
      (c): c is Extract<ChatChunk, { type: 'usage' }> => c.type === 'usage',
    );
    expect(usage?.usage.totalTokens).toBe(10);
    expect(chunks.at(-1)).toEqual({ type: 'done', finishReason: 'stop' });
  });

  it('surfaces tool calls with stringified arguments', async () => {
    const fetchImpl = (async () =>
      ndjsonResponse([
        '{"message":{"content":"","tool_calls":[{"function":{"name":"read_file","arguments":{"path":"a.ts"}}}]},"done":false}\n',
        '{"message":{"content":""},"done":true}\n',
      ])) as unknown as typeof fetch;

    const provider = new OllamaProvider({ id: 'o', baseUrl: 'http://x', model: 'm', fetchImpl });
    const chunks = await collect(provider.chat({ messages: [{ role: 'user', content: 'hi' }] }));
    const call = chunks.find(
      (c): c is Extract<ChatChunk, { type: 'tool_call' }> => c.type === 'tool_call',
    );
    expect(call?.call.name).toBe('read_file');
    expect(JSON.parse(call?.call.arguments ?? '{}')).toEqual({ path: 'a.ts' });
    expect(chunks.at(-1)).toEqual({ type: 'done', finishReason: 'tool_calls' });
  });
});
