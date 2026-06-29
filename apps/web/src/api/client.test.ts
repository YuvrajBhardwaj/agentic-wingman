import { describe, expect, it, vi } from 'vitest';

import { createClient } from './client.ts';
import type { AppEvent } from './events.ts';

const sseResponse = (frames: readonly string[]): Response => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
};

describe('createClient', () => {
  it('streams agent events to the onEvent callback', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        'event: run_started\ndata: {"type":"run_started","runId":"r1","conversationId":"c1"}\n\n',
        'event: done\ndata: {"type":"done","reason":"completed"}\n\n',
      ]),
    ) as unknown as typeof fetch;

    const client = createClient(fetchImpl);
    const events: AppEvent[] = [];
    await client.runAgent({ input: 'hi', onEvent: (e) => events.push(e) });
    expect(events.map((e) => e.type)).toEqual(['run_started', 'done']);
  });

  it('posts approval decisions to the right endpoint', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createClient(fetchImpl);
    await client.resolveApproval('r1', 'a1', true);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/agent/runs/r1/approvals/a1',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('searches memories', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [{ id: 'm1', content: 'x' }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createClient(fetchImpl);
    const results = await client.searchMemories('vector db', 3);
    expect(results[0]?.id).toBe('m1');
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/memory/search?q=vector%20db&limit=3'),
    );
  });
});
