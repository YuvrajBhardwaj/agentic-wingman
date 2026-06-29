import type { JsonSchema, PermissionRequest, Result, Tool, ToolError } from '@forgewright/types';
import { err, ok } from '@forgewright/types';

import type { McpClient, McpToolDef } from './client.js';

/** Forgewright tool name for an MCP tool: `mcp__<server>__<tool>`. */
export const mcpToolName = (serverName: string, toolName: string): string =>
  `mcp__${serverName}__${toolName}`;

/**
 * Wraps a tool exposed by an MCP server as a Forgewright {@link Tool}. The MCP
 * server's JSON Schema is surfaced to the LLM; execution forwards to the server
 * via `tools/call`. All MCP tools use the `mcp.call` capability so the broker
 * (and per-server trust rules) gate them.
 */
export class McpToolAdapter implements Tool<Record<string, unknown>, unknown> {
  readonly name: string;
  readonly description: string;
  readonly schema: JsonSchema;
  readonly capability = 'mcp.call' as const;
  private readonly toolName: string;

  constructor(
    private readonly serverName: string,
    def: McpToolDef,
    private readonly client: McpClient,
  ) {
    this.toolName = def.name;
    this.name = mcpToolName(serverName, def.name);
    this.description = def.description ?? `MCP tool "${def.name}" from server "${serverName}"`;
    this.schema = def.inputSchema ?? { type: 'object' };
  }

  parse(raw: unknown): Result<Record<string, unknown>, ToolError> {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return err({ code: 'TOOL_INPUT_INVALID', message: `${this.name}: expected an object input` });
    }
    return ok(raw as Record<string, unknown>);
  }

  describe(_input: Record<string, unknown>): PermissionRequest {
    return {
      capability: 'mcp.call',
      summary: `MCP ${this.serverName}: ${this.toolName}`,
      target: this.name,
    };
  }

  execute(input: Record<string, unknown>): Promise<unknown> {
    return this.client.callTool(this.toolName, input);
  }
}
