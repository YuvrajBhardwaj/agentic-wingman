import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MemorySink, StructuredLogger } from '@forgewright/shared';
import { describe, expect, it } from 'vitest';

import { McpClient } from './client.js';
import { McpHost } from './host.js';
import { StdioTransport } from './stdio-transport.js';

const here = dirname(fileURLToPath(import.meta.url));
const echoServer = join(here, '..', 'fixtures', 'echo-server.mjs');
const logger = new StructuredLogger({ sink: new MemorySink() });

describe('MCP over real stdio', () => {
  it('initializes, lists, and calls tools on a spawned server', async () => {
    const client = new McpClient(new StdioTransport({ command: 'node', args: [echoServer] }));
    try {
      const info = await client.initialize();
      expect(info.name).toBe('echo-server');

      const tools = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(['echo']);

      const result = await client.callTool('echo', { text: 'hello mcp' });
      expect(result.content?.[0]?.text).toBe('echo: hello mcp');
    } finally {
      await client.close();
    }
  });

  it('aggregates a spawned server into the host with trust rules and hot reload', async () => {
    const host = new McpHost(
      [{ name: 'echo', command: 'node', args: [echoServer], trust: 'allow' }],
      logger,
    );
    try {
      await host.connectAll();

      const tools = host.tools();
      expect(tools.map((t) => t.name)).toEqual(['mcp__echo__echo']);

      const rules = host.permissionRules();
      expect(rules).toEqual([
        { capability: 'mcp.call', targetPattern: 'mcp__echo__*', decision: 'allow' },
      ]);

      const summaries = host.list();
      expect(summaries[0]).toMatchObject({ name: 'echo', connected: true });

      // Hot reload reconnects and still exposes the tool.
      expect(await host.reload('echo')).toBe(true);
      expect(host.tools().map((t) => t.name)).toEqual(['mcp__echo__echo']);
    } finally {
      await host.close();
    }
  });

  it('does not throw when a server fails to start', async () => {
    const host = new McpHost(
      [{ name: 'broken', command: 'definitely-not-a-real-command-xyz', args: [] }],
      logger,
    );
    await host.connectAll(); // failure is logged, not thrown
    expect(host.list()[0]).toMatchObject({ name: 'broken', connected: false });
    await host.close();
  });
});
