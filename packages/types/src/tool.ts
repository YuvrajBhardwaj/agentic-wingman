import type { Logger } from './logger.js';
import type { Capability, PermissionBroker, PermissionRequest } from './permissions.js';
import type { Result } from './result.js';

/** A JSON Schema object describing a tool's input. */
export interface JsonSchema {
  readonly type: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly items?: JsonSchema;
  readonly required?: readonly string[];
  readonly enum?: readonly unknown[];
  readonly description?: string;
  readonly default?: unknown;
  readonly additionalProperties?: boolean | JsonSchema;
  readonly [key: string]: unknown;
}

/** Minimal filesystem surface tools use, so they can be sandboxed/faked. */
export interface ToolFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<readonly string[]>;
}

export interface ToolContext {
  /** Absolute working directory (workspace root). */
  readonly cwd: string;
  readonly signal: AbortSignal;
  readonly permissions: PermissionBroker;
  readonly logger: Logger;
  readonly fs: ToolFs;
}

export interface ToolError {
  readonly code: string;
  readonly message: string;
}

/**
 * A capability the agent can invoke. `I` is validated against `schema` before
 * `execute` runs. Tools must be pure with respect to their declared capability.
 */
export interface Tool<I = unknown, O = unknown> {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the input, exposed to the LLM. */
  readonly schema: JsonSchema;
  /** Capability required to run; gated by the permission broker. */
  readonly capability: Capability;
  /** Validate raw LLM-provided input into a typed input. */
  parse(raw: unknown): Result<I, ToolError>;
  /**
   * Build the permission request for a given input (target, destructiveness),
   * letting the broker make an informed allow/prompt/deny decision.
   */
  describe(input: I): PermissionRequest;
  execute(input: I, ctx: ToolContext): Promise<O>;
}

/** The serialized form handed to an LLM for tool/function calling. */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): readonly Tool[];
  /** Specs for every registered tool, for inclusion in an LLM request. */
  specs(): readonly ToolSpec[];
  /** Validate, permission-gate, and run a tool by name. */
  execute(name: string, rawInput: unknown, ctx: ToolContext): Promise<unknown>;
}
