import { z } from 'zod';

import { defineTool } from '../define-tool.js';

const input = z.object({
  url: z.string().url().describe('Absolute http(s) URL to fetch'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  maxBytes: z.number().int().min(1).max(2_000_000).default(500_000),
});

export interface HttpFetchResult {
  readonly status: number;
  readonly ok: boolean;
  readonly contentType: string | null;
  readonly body: string;
  readonly truncated: boolean;
}

/** A safe, capped HTTP client tool. Network access is permission-gated. */
export const httpFetchTool = defineTool({
  name: 'http_request',
  description: 'Perform an HTTP request and return the (size-capped) response body.',
  capability: 'net.http',
  input,
  describe: (i) => ({
    summary: `${i.method} ${i.url}`,
    target: i.url,
    destructive: i.method !== 'GET' && i.method !== 'HEAD',
  }),
  run: async (i, ctx) => {
    const init: RequestInit = { method: i.method, signal: ctx.signal };
    if (i.headers) init.headers = i.headers;
    if (i.body !== undefined) init.body = i.body;

    const response = await fetch(i.url, init);
    const full = await response.text();
    const truncated = full.length > i.maxBytes;
    return {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      body: full.slice(0, i.maxBytes),
      truncated,
    };
  },
});
