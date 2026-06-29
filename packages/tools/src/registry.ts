import { ForgewrightError } from '@forgewright/shared';
import type { Tool, ToolContext, ToolRegistry, ToolSpec } from '@forgewright/types';

/**
 * Default tool registry. `execute` runs the full pipeline:
 * validate input → request permission → run. Any failure throws a
 * {@link ForgewrightError} with a stable code.
 */
export class DefaultToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new ForgewrightError('INTERNAL', `Tool "${tool.name}" is already registered`, {
        tool: tool.name,
      });
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): readonly Tool[] {
    return [...this.tools.values()];
  }

  specs(): readonly ToolSpec[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    }));
  }

  async execute(name: string, rawInput: unknown, ctx: ToolContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ForgewrightError('NOT_FOUND', `Unknown tool "${name}"`, { tool: name });
    }

    const parsed = tool.parse(rawInput);
    if (!parsed.ok) {
      throw new ForgewrightError('TOOL_INPUT_INVALID', parsed.error.message, {
        tool: name,
        code: parsed.error.code,
      });
    }

    const request = tool.describe(parsed.value);
    const grant = await ctx.permissions.request(request);
    if (!grant.allowed) {
      throw new ForgewrightError('PERMISSION_DENIED', `"${name}" denied: ${grant.reason}`, {
        tool: name,
        capability: request.capability,
        target: request.target,
      });
    }

    if (ctx.signal.aborted) {
      throw new ForgewrightError('ABORTED', `"${name}" aborted before execution`, { tool: name });
    }

    try {
      return await tool.execute(parsed.value, ctx);
    } catch (error) {
      if (error instanceof ForgewrightError) throw error;
      throw new ForgewrightError(
        'TOOL_EXECUTION_FAILED',
        `"${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
        { tool: name },
        { cause: error },
      );
    }
  }
}
