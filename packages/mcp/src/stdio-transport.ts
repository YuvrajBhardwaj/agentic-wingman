import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import { ForgewrightError } from '@forgewright/shared';

import type { JsonRpcMessage, Transport } from './jsonrpc.js';

export interface StdioTransportOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

/**
 * MCP stdio transport: spawns the server process and exchanges newline-delimited
 * JSON-RPC messages over stdin/stdout. Non-JSON stdout lines (server logs) are
 * ignored; stderr is drained.
 */
export class StdioTransport implements Transport {
  private child: ChildProcessWithoutNullStreams | undefined;
  private buffer = '';
  private messageHandler: ((message: JsonRpcMessage) => void) | undefined;
  private closeHandler: (() => void) | undefined;

  constructor(private readonly options: StdioTransportOptions) {}

  async start(): Promise<void> {
    const child = spawn(this.options.command, [...(this.options.args ?? [])], {
      env: this.options.env ? { ...process.env, ...this.options.env } : process.env,
      ...(this.options.cwd ? { cwd: this.options.cwd } : {}),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.onData(chunk));
    child.stderr.resume(); // drain logs
    child.on('close', () => this.closeHandler?.());
    // A spawn error (e.g. command not found) closes the transport so the client
    // rejects pending requests rather than hanging.
    child.on('error', () => this.closeHandler?.());
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line === '') continue;
      try {
        this.messageHandler?.(JSON.parse(line) as JsonRpcMessage);
      } catch {
        // Non-JSON line (a server log statement) — ignore.
      }
    }
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.child) throw new ForgewrightError('INTERNAL', 'MCP transport not started');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  async close(): Promise<void> {
    this.child?.kill();
    this.child = undefined;
  }
}
