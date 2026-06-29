import type { ServerResponse } from 'node:http';

/** Minimal Server-Sent-Events writer over a Node HTTP response. */
export class SseStream {
  constructor(private readonly res: ServerResponse) {}

  start(): void {
    this.res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
  }

  /** Write a named event with a JSON payload. */
  send(event: string, data: unknown): void {
    if (this.res.writableEnded) return;
    this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  end(): void {
    if (!this.res.writableEnded) this.res.end();
  }
}
