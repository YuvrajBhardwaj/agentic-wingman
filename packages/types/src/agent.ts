import type { ChatMessage, TokenUsage } from './llm.js';

export interface AgentTask {
  readonly conversationId: string;
  readonly input: string;
  /** Prior turns in this conversation, so the agent has multi-turn continuity. */
  readonly history?: readonly ChatMessage[];
  /** Files the user is focused on, used to seed context. */
  readonly focusPaths?: readonly string[];
  readonly maxSteps?: number;
  readonly signal?: AbortSignal;
}

/** Events streamed from the agent loop to the host/UI. */
export type AgentEvent =
  | { readonly type: 'reasoning'; readonly text: string }
  | { readonly type: 'message'; readonly delta: string }
  | {
      readonly type: 'tool_call';
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: 'tool_result';
      readonly id: string;
      readonly output: unknown;
      readonly isError: boolean;
    }
  | {
      readonly type: 'approval_required';
      readonly id: string;
      readonly summary: string;
      readonly target?: string;
    }
  | { readonly type: 'usage'; readonly usage: TokenUsage }
  | { readonly type: 'step'; readonly index: number; readonly maxSteps: number }
  | {
      readonly type: 'done';
      readonly reason: 'completed' | 'max_steps' | 'aborted' | 'error';
      readonly message?: string;
    };

export interface AgentResult {
  readonly conversationId: string;
  readonly messages: readonly ChatMessage[];
  readonly steps: number;
  readonly reason: 'completed' | 'max_steps' | 'aborted' | 'error';
}

/** The core reasoning + tool-execution loop. */
export interface Agent {
  run(task: AgentTask): AsyncIterable<AgentEvent>;
}
