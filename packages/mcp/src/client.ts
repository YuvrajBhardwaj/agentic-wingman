import type { JsonSchema } from '@forgewright/types';

import { JsonRpcClient, type Transport } from './jsonrpc.js';

export interface McpToolDef {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: JsonSchema;
}

export interface McpServerInfo {
  readonly name?: string;
  readonly version?: string;
}

export interface McpContent {
  readonly type: string;
  readonly text?: string;
  readonly [key: string]: unknown;
}

export interface McpCallResult {
  readonly content?: readonly McpContent[];
  readonly isError?: boolean;
  readonly [key: string]: unknown;
}

const PROTOCOL_VERSION = '2024-11-05';

/** A minimal Model Context Protocol client: handshake, list tools, call tools. */
export class McpClient {
  private readonly rpc: JsonRpcClient;

  constructor(private readonly transport: Transport) {
    this.rpc = new JsonRpcClient(transport);
  }

  async initialize(): Promise<McpServerInfo> {
    await this.transport.start();
    const result = await this.rpc.request<{ serverInfo?: McpServerInfo }>('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'forgewright', version: '0.0.1' },
    });
    this.rpc.notify('notifications/initialized');
    return result.serverInfo ?? {};
  }

  async listTools(): Promise<readonly McpToolDef[]> {
    const result = await this.rpc.request<{ tools?: McpToolDef[] }>('tools/list', {});
    return result.tools ?? [];
  }

  async callTool(name: string, args: unknown): Promise<McpCallResult> {
    return this.rpc.request<McpCallResult>('tools/call', { name, arguments: args ?? {} });
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}
