import { createModelRouter } from '@forgewright/llm';
import {
  DefaultPermissionBroker,
  DefaultToolRegistry,
  registerBuiltinTools,
  SandboxedFs,
  type Approver,
} from '@forgewright/tools';
import type {
  ContextBuilder,
  Logger,
  MemoryStore,
  ModelRouter,
  PermissionBroker,
  PermissionPolicyRule,
  Tool,
  ToolContext,
  ToolRegistry,
  ForgewrightConfig,
} from '@forgewright/types';

import { AgentLoop } from './agent-loop.js';

export interface CreateAgentOptions {
  readonly config: ForgewrightConfig;
  readonly logger: Logger;
  /** Approval callback for prompted permissions; defaults to deny (fail-safe). */
  readonly approver?: Approver;
  readonly permissionRules?: readonly PermissionPolicyRule[];
  readonly router?: ModelRouter;
  readonly contextBuilder?: ContextBuilder;
  readonly memoryStore?: MemoryStore;
  /** Extra tools to register alongside the builtins (e.g. from MCP servers). */
  readonly extraTools?: readonly Tool[];
  /** Injected for tests. */
  readonly fetchImpl?: typeof fetch;
}

export interface CreatedAgent {
  readonly agent: AgentLoop;
  readonly registry: ToolRegistry;
  readonly router: ModelRouter;
  readonly permissions: PermissionBroker;
}

/**
 * Assemble a fully-wired coding agent: builtin tools, model router from config,
 * a permission broker, and a sandboxed tool context rooted at the workspace.
 */
export const createAgent = (options: CreateAgentOptions): CreatedAgent => {
  const registry = new DefaultToolRegistry();
  registerBuiltinTools(registry);
  for (const tool of options.extraTools ?? []) registry.register(tool);

  const router = options.router ?? createModelRouter(options.config.llm, options.fetchImpl);

  const permissions = new DefaultPermissionBroker({
    ...(options.approver ? { approver: options.approver } : {}),
    ...(options.permissionRules ? { rules: options.permissionRules } : {}),
    logger: options.logger,
  });

  const fs = new SandboxedFs(options.config.workspaceRoot);

  const buildToolContext = (signal: AbortSignal): ToolContext => ({
    cwd: options.config.workspaceRoot,
    signal,
    permissions,
    logger: options.logger,
    fs,
  });

  const agent = new AgentLoop({
    router,
    registry,
    buildToolContext,
    logger: options.logger,
    workspaceRoot: options.config.workspaceRoot,
    ...(options.contextBuilder ? { contextBuilder: options.contextBuilder } : {}),
    ...(options.memoryStore ? { memoryStore: options.memoryStore } : {}),
  });

  return { agent, registry, router, permissions };
};
