import { describe, expect, it, vi } from 'vitest';

import type { McpClient } from './client.js';
import { McpToolAdapter } from './tool-adapter.js';

const fakeClient = (callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }))) =>
  ({ callTool }) as unknown as McpClient;

describe('McpToolAdapter', () => {
  it('namespaces the tool and surfaces the MCP schema', () => {
    const adapter = new McpToolAdapter(
      'github',
      {
        name: 'search',
        description: 'search repos',
        inputSchema: { type: 'object', properties: {} },
      },
      fakeClient(),
    );
    expect(adapter.name).toBe('mcp__github__search');
    expect(adapter.description).toBe('search repos');
    expect(adapter.schema.type).toBe('object');
    expect(adapter.capability).toBe('mcp.call');
  });

  it('validates that input is an object', () => {
    const adapter = new McpToolAdapter('s', { name: 't' }, fakeClient());
    expect(adapter.parse({ a: 1 }).ok).toBe(true);
    expect(adapter.parse('nope').ok).toBe(false);
    expect(adapter.parse([1, 2]).ok).toBe(false);
  });

  it('describes a permission request under the mcp.call capability', () => {
    const adapter = new McpToolAdapter('s', { name: 't' }, fakeClient());
    const req = adapter.describe({});
    expect(req.capability).toBe('mcp.call');
    expect(req.target).toBe('mcp__s__t');
  });

  it('forwards execution to the MCP client', async () => {
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'done' }] }));
    const adapter = new McpToolAdapter('s', { name: 'echo' }, fakeClient(callTool));
    const result = await adapter.execute({ text: 'hello' });
    expect(callTool).toHaveBeenCalledWith('echo', { text: 'hello' });
    expect(result).toEqual({ content: [{ type: 'text', text: 'done' }] });
  });
});
