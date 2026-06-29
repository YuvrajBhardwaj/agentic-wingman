import { describe, expect, it } from 'vitest';

import type { AppEvent } from './events.ts';
import { parseEventStream } from './sse.ts';

const streamOf = (pieces: readonly string[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const p of pieces) controller.enqueue(enc.encode(p));
      controller.close();
    },
  });

const collect = async (body: ReadableStream<Uint8Array>): Promise<AppEvent[]> => {
  const out: AppEvent[] = [];
  for await (const e of parseEventStream(body)) out.push(e);
  return out;
};

describe('parseEventStream', () => {
  it('parses named SSE frames split across chunks', async () => {
    const events = await collect(
      streamOf([
        'event: run_started\ndata: {"type":"run_started","runId":"r1","conversationId":"c1"}\n\n',
        'event: message\ndata: {"type":"message","del',
        'ta":"Hello"}\n\nevent: done\ndata: {"type":"done","reason":"completed"}\n\n',
      ]),
    );
    expect(events.map((e) => e.type)).toEqual(['run_started', 'message', 'done']);
    expect(events[1]).toEqual({ type: 'message', delta: 'Hello' });
  });

  it('ignores malformed frames', async () => {
    const events = await collect(
      streamOf(['data: not-json\n\n', 'data: {"type":"done","reason":"completed"}\n\n']),
    );
    expect(events.map((e) => e.type)).toEqual(['done']);
  });
});
