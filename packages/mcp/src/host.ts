import type { Logger, McpServerConfig, PermissionPolicyRule, Tool } from '@forgewright/types';

import { McpClient } from './client.js';
import type { Transport } from './jsonrpc.js';
import { StdioTransport } from './stdio-transport.js';
import { McpToolAdapter } from './tool-adapter.js';

export interface McpServerSummary {
  readonly name: string;
  readonly connected: boolean;
  readonly tools: readonly string[];
}

interface Connected {
  readonly client: McpClient;
  readonly tools: McpToolAdapter[];
  readonly config: McpServerConfig;
}

export type TransportFactory = (config: McpServerConfig) => Transport;

const defaultTransportFactory: TransportFactory = (config) =>
  new StdioTransport({
    command: config.command,
    ...(config.args ? { args: config.args } : {}),
    ...(config.env ? { env: config.env } : {}),
  });

/**
 * Connects and manages multiple MCP servers, aggregating their tools as
 * Forgewright tools. Supports hot reload (reconnect a single server) and emits
 * per-server permission rules derived from each server's `trust` setting.
 */
export class McpHost {
  private readonly servers = new Map<string, Connected>();
  private readonly transportFactory: TransportFactory;

  constructor(
    private readonly configs: readonly McpServerConfig[],
    private readonly logger: Logger,
    transportFactory?: TransportFactory,
  ) {
    this.transportFactory = transportFactory ?? defaultTransportFactory;
  }

  /** Connect every configured server; failures are logged, not thrown. */
  async connectAll(): Promise<void> {
    await Promise.all(
      this.configs.map((config) =>
        this.connect(config).catch((error: unknown) =>
          this.logger.warn('mcp_connect_failed', {
            name: config.name,
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
      ),
    );
  }

  private async connect(config: McpServerConfig): Promise<void> {
    const client = new McpClient(this.transportFactory(config));
    await client.initialize();
    const defs = await client.listTools();
    const tools = defs.map((def) => new McpToolAdapter(config.name, def, client));
    this.servers.set(config.name, { client, tools, config });
    this.logger.info('mcp_connected', { name: config.name, tools: tools.length });
  }

  /** All MCP tools across connected servers. */
  tools(): readonly Tool[] {
    return [...this.servers.values()].flatMap((s) => s.tools);
  }

  /** Permission rules honoring each server's `trust` (e.g. auto-allow a trusted server). */
  permissionRules(): readonly PermissionPolicyRule[] {
    const rules: PermissionPolicyRule[] = [];
    for (const { config } of this.servers.values()) {
      if (config.trust) {
        rules.push({
          capability: 'mcp.call',
          targetPattern: `mcp__${config.name}__*`,
          decision: config.trust,
        });
      }
    }
    return rules;
  }

  list(): readonly McpServerSummary[] {
    return this.configs.map((config) => {
      const connected = this.servers.get(config.name);
      return {
        name: config.name,
        connected: connected !== undefined,
        tools: connected ? connected.tools.map((t) => t.name) : [],
      };
    });
  }

  /** Hot-reload a server: disconnect (if connected) and reconnect. */
  async reload(name: string): Promise<boolean> {
    const config = this.configs.find((c) => c.name === name);
    if (!config) return false;
    const existing = this.servers.get(name);
    if (existing) {
      await existing.client.close();
      this.servers.delete(name);
    }
    await this.connect(config);
    return true;
  }

  async close(): Promise<void> {
    await Promise.all([...this.servers.values()].map((s) => s.client.close()));
    this.servers.clear();
  }
}
