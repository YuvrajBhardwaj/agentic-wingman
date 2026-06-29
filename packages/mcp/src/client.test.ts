import { describe, expect, it } from 'vitest';

import { McpClient } from './client.js';
import type { JsonRpcError, JsonRpcMessage, Transport } from './jsonrpc.js';

type Responder = (method: string, params: unknown) => { result?: unknown; error?: JsonRpcError };

/** In-memory transport that answers requests via a responder function. */
class MockTransport implements Transport {
  private messageHandler: ((m: JsonRpcMessage) => void) | undefined;
  private closeHandler: (() => void) | undefined;
  readonly sent: JsonRpcMessage[] = [];

  constructor(private readonly responder: Responder) {}

  async start(): Promise<void> {}

  async send(message: JsonRpcMessage): Promise<void> {
    this.sent.push(message);
    if (!('id' in message) || message.id === undefined) return; // notification
    const { result, error } = this.responder(
      message.method,
      (message as { params?: unknown }).params,
    );
    queueMicrotask(() =>
      this.messageHandler?.(
        error
          ? { jsonrpc: '2.0', id: message.id, error }
          : { jsonrpc: '2.0', id: message.id, result },
      ),
    );
  }

  onMessage(handler: (m: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }
  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }
  async close(): Promise<void> {
    this.closeHandler?.();
  }
}

const responder: Responder = (method, params) => {
  switch (method) {
    case 'initialize':
      return { result: { serverInfo: { name: 'mock', version: '1' } } };
    case 'tools/list':
      return {
        result: { tools: [{ name: 'echo', description: 'echo', inputSchema: { type: 'object' } }] },
      };
    case 'tools/call': {
      const args = (params as { arguments?: unknown }).arguments;
      return { result: { content: [{ type: 'text', text: JSON.stringify(args) }] } };
    }
    default:
      return { error: { code: -32601, message: 'not found' } };
  }
};

describe('McpClient', () => {
  it('performs the initialize handshake and sends the initialized notification', async () => {
    const transport = new MockTransport(responder);
    const client = new McpClient(transport);
    const info = await client.initialize();
    expect(info.name).toBe('mock');
    expect(transport.sent.some((m) => m.method === 'notifications/initialized')).toBe(true);
  });

  it('lists and calls tools', async () => {
    const client = new McpClient(new MockTransport(responder));
    await client.initialize();
    const tools = await client.listTools();
    expect(tools[0]?.name).toBe('echo');

    const result = await client.callTool('echo', { text: 'hi' });
    expect(result.content?.[0]?.text).toBe('{"text":"hi"}');
  });

  it('rejects when the server returns an error response', async () => {
    const erroring: Responder = (method) =>
      method === 'tools/call'
        ? { error: { code: -32000, message: 'tool blew up' } }
        : { result: {} };
    const client = new McpClient(new MockTransport(erroring));
    await client.initialize();
    await expect(client.callTool('echo', {})).rejects.toThrow(/MCP error -32000/);
  });
});
