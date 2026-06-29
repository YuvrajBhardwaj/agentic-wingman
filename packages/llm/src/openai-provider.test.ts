import type { ChatChunk } from '@forgewright/types';
import { describe, expect, it } from 'vitest';

import { OpenAiCompatibleProvider } from './openai-provider.js';

/** Build a Response whose body streams the given text pieces. */
const streamResponse = (pieces: readonly string[], status = 200): Response => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(stream, { status });
};

const collect = async (iter: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> => {
  const out: ChatChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
};

describe('OpenAiCompatibleProvider', () => {
  it('streams text deltas and a final done', async () => {
    const fetchImpl = (async () =>
      streamResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":", world"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ])) as unknown as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      id: 'p',
      baseUrl: 'http://x/v1',
      model: 'm',
      fetchImpl,
    });
    const chunks = await collect(provider.chat({ messages: [{ role: 'user', content: 'hi' }] }));
    const text = chunks
      .filter((c): c is Extract<ChatChunk, { type: 'text' }> => c.type === 'text')
      .map((c) => c.delta)
      .join('');
    expect(text).toBe('Hello, world');
    expect(chunks.at(-1)).toEqual({ type: 'done', finishReason: 'stop' });
  });

  it('assembles tool calls whose arguments are split across chunks', async () => {
    const fetchImpl = (async () =>
      streamResponse([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","function":{"name":"write_file","arguments":"{\\"path\\":\\"a.ts\\","}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"content\\":\\"x\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ])) as unknown as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      id: 'p',
      baseUrl: 'http://x/v1',
      model: 'm',
      fetchImpl,
    });
    const chunks = await collect(provider.chat({ messages: [{ role: 'user', content: 'hi' }] }));

    const toolCall = chunks.find(
      (c): c is Extract<ChatChunk, { type: 'tool_call' }> => c.type === 'tool_call',
    );
    expect(toolCall?.call.name).toBe('write_file');
    expect(JSON.parse(toolCall?.call.arguments ?? '{}')).toEqual({ path: 'a.ts', content: 'x' });

    const usage = chunks.find(
      (c): c is Extract<ChatChunk, { type: 'usage' }> => c.type === 'usage',
    );
    expect(usage?.usage.totalTokens).toBe(15);
    expect(chunks.at(-1)).toEqual({ type: 'done', finishReason: 'tool_calls' });
  });

  it('throws a ForgewrightError on non-2xx', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const provider = new OpenAiCompatibleProvider({
      id: 'p',
      baseUrl: 'http://x/v1',
      model: 'm',
      fetchImpl,
    });
    await expect(collect(provider.chat({ messages: [] }))).rejects.toThrowError(
      /LLM request failed/,
    );
  });
});
