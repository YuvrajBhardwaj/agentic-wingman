import type {
  Agent,
  AgentEvent,
  AgentTask,
  ChatChunk,
  ChatMessage,
  ContextBuilder,
  Logger,
  MemoryStore,
  ModelRole,
  ModelRouter,
  ToolCall,
  ToolContext,
  ToolRegistry,
} from '@forgewright/types';

import { buildSystemPrompt } from './system-prompt.js';

export interface AgentLoopOptions {
  readonly router: ModelRouter;
  readonly registry: ToolRegistry;
  /** Build a per-run tool context (cwd, permissions, fs, logger) bound to a signal. */
  readonly buildToolContext: (signal: AbortSignal) => ToolContext;
  readonly logger: Logger;
  readonly workspaceRoot: string;
  readonly role?: ModelRole;
  readonly defaultMaxSteps?: number;
  /** Optional retrieval; when present, relevant context is injected each run. */
  readonly contextBuilder?: ContextBuilder;
  readonly contextTokenBudget?: number;
  /** Optional long-term memory; relevant memories are injected each run. */
  readonly memoryStore?: MemoryStore;
  readonly memoryLimit?: number;
  /** Cap on output tokens per turn (helps with rate-limited providers). */
  readonly maxOutputTokens?: number;
  readonly extraSystemPrompt?: string;
}

interface TurnOutput {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
}

/**
 * The core reasoning + tool-execution loop. Each step streams a model turn; if
 * the model requests tools, they are executed (in parallel, permission-gated)
 * and their results fed back, until the model stops, the step budget is hit, or
 * the run is interrupted.
 */
export class AgentLoop implements Agent {
  constructor(private readonly options: AgentLoopOptions) {}

  async *run(task: AgentTask): AsyncIterable<AgentEvent> {
    const controller = new AbortController();
    const signal = task.signal ? anySignal([task.signal, controller.signal]) : controller.signal;
    const ctx = this.options.buildToolContext(signal);
    const role = this.options.role ?? 'coding';
    const provider = this.options.router.forRole(role);
    const maxSteps = task.maxSteps ?? this.options.defaultMaxSteps ?? 12;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt({
          workspaceRoot: this.options.workspaceRoot,
          tools: this.options.registry.specs(),
          ...(this.options.extraSystemPrompt ? { extra: this.options.extraSystemPrompt } : {}),
        }),
      },
    ];

    if (this.options.contextBuilder) {
      const bundle = await this.options.contextBuilder.build(
        {
          query: task.input,
          tokenBudget: this.options.contextTokenBudget ?? 6000,
          ...(task.focusPaths ? { focusPaths: task.focusPaths } : {}),
        },
        signal,
      );
      if (bundle.chunks.length > 0) {
        const rendered = bundle.chunks
          .map((c) => `${c.path ? `// ${c.path}\n` : ''}${c.content}`)
          .join('\n\n');
        messages.push({
          role: 'system',
          content: `Relevant context retrieved from the workspace:\n\n${rendered}`,
        });
      }
    }

    if (this.options.memoryStore) {
      const memories = await this.options.memoryStore.retrieve({
        query: task.input,
        limit: this.options.memoryLimit ?? 5,
      });
      if (memories.length > 0) {
        const rendered = memories.map((m) => `- (${m.kind}) ${m.content}`).join('\n');
        messages.push({
          role: 'system',
          content: `Relevant long-term memories about this user and project:\n${rendered}`,
        });
      }
    }

    // Prior conversation turns give the agent multi-turn continuity within a session.
    if (task.history && task.history.length > 0) {
      messages.push(...task.history);
    }

    messages.push({ role: 'user', content: task.input });

    try {
      for (let step = 0; step < maxSteps; step += 1) {
        if (signal.aborted) {
          yield { type: 'done', reason: 'aborted' };
          return;
        }
        yield { type: 'step', index: step, maxSteps };

        const turn = yield* this.runTurn(provider, messages, signal);

        messages.push({
          role: 'assistant',
          content: turn.text,
          ...(turn.toolCalls.length > 0 ? { toolCalls: turn.toolCalls } : {}),
        });

        if (turn.toolCalls.length === 0) {
          yield { type: 'done', reason: 'completed' };
          return;
        }

        // Execute tools in parallel; emit results in call order (deterministic).
        const executions = turn.toolCalls.map((call) =>
          this.executeCall(call, ctx).catch((error) => ({
            call,
            isError: true,
            output: { error: error instanceof Error ? error.message : String(error) },
          })),
        );
        const results = await Promise.all(executions);

        for (const result of results) {
          yield {
            type: 'tool_result',
            id: result.call.id,
            output: result.output,
            isError: result.isError,
          };
          messages.push({
            role: 'tool',
            toolCallId: result.call.id,
            name: result.call.name,
            content: JSON.stringify(result.output),
          });
        }
      }

      yield { type: 'done', reason: 'max_steps', message: `Stopped after ${maxSteps} steps` };
    } catch (error) {
      this.options.logger.error('agent_loop_error', {
        message: error instanceof Error ? error.message : String(error),
      });
      yield {
        type: 'done',
        reason: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Stream one model turn, emitting text/tool/usage events and returning the turn. */
  private async *runTurn(
    provider: ReturnType<ModelRouter['forRole']>,
    messages: readonly ChatMessage[],
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent, TurnOutput> {
    let text = '';
    const toolCalls: ToolCall[] = [];
    let finishReason: TurnOutput['finishReason'] = 'stop';

    const stream = provider.chat({
      messages,
      tools: this.options.registry.specs(),
      signal,
      ...(this.options.maxOutputTokens ? { maxTokens: this.options.maxOutputTokens } : {}),
    });

    for await (const chunk of stream as AsyncIterable<ChatChunk>) {
      switch (chunk.type) {
        case 'text':
          text += chunk.delta;
          yield { type: 'message', delta: chunk.delta };
          break;
        case 'tool_call':
          toolCalls.push(chunk.call);
          yield {
            type: 'tool_call',
            id: chunk.call.id,
            name: chunk.call.name,
            input: safeJson(chunk.call.arguments),
          };
          break;
        case 'usage':
          yield { type: 'usage', usage: chunk.usage };
          break;
        case 'done':
          finishReason = chunk.finishReason;
          break;
        default:
          break;
      }
    }

    return { text, toolCalls, finishReason };
  }

  private async executeCall(
    call: ToolCall,
    ctx: ToolContext,
  ): Promise<{ call: ToolCall; output: unknown; isError: boolean }> {
    const input = safeJson(call.arguments);
    const output = await this.options.registry.execute(call.name, input, ctx);
    return { call, output, isError: false };
  }
}

const safeJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

/** Combine multiple abort signals into one that fires when any does. */
const anySignal = (signals: readonly AbortSignal[]): AbortSignal => {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
};
