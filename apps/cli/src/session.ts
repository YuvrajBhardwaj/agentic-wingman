import { createAgent } from '@forgewright/agent';
import { createContextBuilder, createIndexer } from '@forgewright/context';
import { createModelRouter } from '@forgewright/llm';
import { loadConfig } from '@forgewright/shared';
import type { Approver } from '@forgewright/tools';
import type {
  AgentEvent,
  AgentTask,
  ChatMessage,
  ForgewrightConfig,
  Logger,
  MemoryStore,
  PermissionPolicyRule,
  ToolSpec,
} from '@forgewright/types';

const MAX_HISTORY_TURNS = 12;

export interface SessionOptions {
  readonly logger: Logger;
  readonly approver: Approver;
  /** Defaults to loadConfig(); injectable for tests. */
  readonly config?: ForgewrightConfig;
  /** Provide a memory store (skipped in tests / when embeddings are unwanted). */
  readonly memoryStore?: MemoryStore;
}

/** A long-lived CLI session: one agent, one conversation, persistent permissions. */
export class CliSession {
  readonly config: ForgewrightConfig;
  private readonly conversationId = 'cli';
  private readonly history: ChatMessage[] = [];
  private readonly agent: ReturnType<typeof createAgent>['agent'];
  private readonly registry: ReturnType<typeof createAgent>['registry'];
  private readonly permissions: ReturnType<typeof createAgent>['permissions'];

  constructor(options: SessionOptions) {
    this.config = options.config ?? loadConfig();
    const router = createModelRouter(this.config.llm);

    const indexer = createIndexer(this.config.workspaceRoot);
    const contextBuilder = createContextBuilder(this.config.workspaceRoot, indexer);
    // Index in the background; context retrieval simply returns less until ready.
    void indexer.index().catch((error) => {
      options.logger.warn('index_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    });

    const created = createAgent({
      config: this.config,
      logger: options.logger,
      router,
      approver: options.approver,
      contextBuilder,
      ...(options.memoryStore ? { memoryStore: options.memoryStore } : {}),
      ...(this.config.contextTokenBudget
        ? { contextTokenBudget: this.config.contextTokenBudget }
        : {}),
      ...(this.config.agentMaxTokens ? { maxOutputTokens: this.config.agentMaxTokens } : {}),
    });
    this.agent = created.agent;
    this.registry = created.registry;
    this.permissions = created.permissions;
  }

  /** Human-readable description of the active coding model, for the banner. */
  modelLabel(): string {
    const endpointId = this.config.llm.routes.coding;
    const endpoint =
      this.config.llm.endpoints.find((e) => e.id === endpointId) ?? this.config.llm.endpoints[0];
    if (!endpoint) return 'unconfigured';
    const host = safeHost(endpoint.baseUrl);
    return `${endpoint.model}${host ? ` (${host})` : ''}`;
  }

  toolSpecs(): readonly ToolSpec[] {
    return this.registry.specs();
  }

  addPermissionRule(rule: PermissionPolicyRule): void {
    this.permissions.addRule(rule);
  }

  clearHistory(): void {
    this.history.length = 0;
  }

  /** Run one turn; yields agent events. History is updated by the caller via record(). */
  run(input: string, signal: AbortSignal): AsyncIterable<AgentEvent> {
    const task: AgentTask = {
      conversationId: this.conversationId,
      input,
      signal,
      ...(this.history.length > 0 ? { history: [...this.history] } : {}),
    };
    return this.agent.run(task);
  }

  /** Append a completed turn to the rolling history window. */
  record(input: string, assistantText: string): void {
    this.history.push({ role: 'user', content: input });
    this.history.push({ role: 'assistant', content: assistantText });
    const max = MAX_HISTORY_TURNS * 2;
    if (this.history.length > max) this.history.splice(0, this.history.length - max);
  }
}

const safeHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};
