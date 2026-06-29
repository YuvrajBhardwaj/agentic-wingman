import { ForgewrightError } from '@forgewright/shared';

export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

/** Bidirectional message channel for JSON-RPC (stdio, in-memory, etc.). */
export interface Transport {
  start(): Promise<void>;
  send(message: JsonRpcMessage): Promise<void>;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  onClose(handler: () => void): void;
  close(): Promise<void>;
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * A JSON-RPC 2.0 client over a {@link Transport}. Correlates responses to
 * requests by id, with a per-request timeout. Server-initiated requests and
 * notifications are ignored (MCP clients only consume tools here).
 */
export class JsonRpcClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly transport: Transport,
    private readonly timeoutMs = 30000,
  ) {
    transport.onMessage((message) => this.handle(message));
    transport.onClose(() => this.failAll(new Error('MCP transport closed')));
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId;
    this.nextId += 1;
    const promise = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new ForgewrightError('LLM_REQUEST_FAILED', `MCP request "${method}" timed out`, {
            method,
          }),
        );
      }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    });
    void this.transport.send({
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    });
    return promise;
  }

  notify(method: string, params?: unknown): void {
    void this.transport.send({
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    });
  }

  private handle(message: JsonRpcMessage): void {
    if (!('id' in message) || message.id === undefined || message.id === null) return;
    const id = typeof message.id === 'number' ? message.id : Number(message.id);
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);

    const response = message as JsonRpcResponse;
    if (response.error) {
      entry.reject(
        new ForgewrightError(
          'TOOL_EXECUTION_FAILED',
          `MCP error ${response.error.code}: ${response.error.message}`,
          {
            code: response.error.code,
          },
        ),
      );
    } else {
      entry.resolve(response.result);
    }
  }

  private failAll(error: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }
}
