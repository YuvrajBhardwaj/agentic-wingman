import type { ModelRole } from './config.js';
import type { ToolSpec } from './tool.js';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  /** Raw JSON arguments as produced by the model. */
  readonly arguments: string;
}

export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
  /** Present on assistant messages that request tool execution. */
  readonly toolCalls?: readonly ToolCall[];
  /** Present on tool-result messages; correlates with a ToolCall id. */
  readonly toolCallId?: string;
  readonly name?: string;
}

export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolSpec[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

/** A streamed unit of model output. */
export type ChatChunk =
  | { readonly type: 'text'; readonly delta: string }
  | { readonly type: 'tool_call'; readonly call: ToolCall }
  | { readonly type: 'usage'; readonly usage: TokenUsage }
  | { readonly type: 'done'; readonly finishReason: 'stop' | 'length' | 'tool_calls' | 'error' };

export interface LlmModelInfo {
  readonly id: string;
  readonly contextWindow: number;
}

/** A streaming, tool-call-aware chat completion provider. */
export interface LlmProvider {
  readonly id: string;
  readonly info: LlmModelInfo;
  chat(request: ChatRequest): AsyncIterable<ChatChunk>;
}

/** Selects a provider per routing role (cheap/coding/reasoning/verification). */
export interface ModelRouter {
  forRole(role: ModelRole): LlmProvider;
  get(endpointId: string): LlmProvider | undefined;
  list(): readonly LlmProvider[];
}
