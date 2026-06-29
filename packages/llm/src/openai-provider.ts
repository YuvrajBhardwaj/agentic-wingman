import { ForgewrightError } from '@forgewright/shared';
import type {
  ChatChunk,
  ChatMessage,
  ChatRequest,
  LlmModelInfo,
  LlmProvider,
  ToolCall,
  ToolSpec,
} from '@forgewright/types';

import { parseSseJson } from './sse.js';

export interface OpenAiProviderOptions {
  readonly id: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly contextWindow?: number;
  /** Injected for tests; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
}

interface OpenAiDelta {
  readonly content?: string | null;
  readonly tool_calls?: readonly {
    readonly index: number;
    readonly id?: string;
    readonly function?: { readonly name?: string; readonly arguments?: string };
  }[];
}

interface OpenAiStreamChunk {
  readonly choices?: readonly {
    readonly delta?: OpenAiDelta;
    readonly finish_reason?: string | null;
  }[];
  readonly usage?: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  } | null;
}

const toApiMessage = (m: ChatMessage): Record<string, unknown> => {
  const base: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.toolCalls && m.toolCalls.length > 0) {
    base.tool_calls = m.toolCalls.map((c) => ({
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: c.arguments },
    }));
  }
  if (m.toolCallId) base.tool_call_id = m.toolCallId;
  if (m.name) base.name = m.name;
  return base;
};

const toApiTool = (spec: ToolSpec): Record<string, unknown> => ({
  type: 'function',
  function: { name: spec.name, description: spec.description, parameters: spec.parameters },
});

/** Accumulates streamed tool-call fragments keyed by their stream index. */
class ToolCallAccumulator {
  private readonly byIndex = new Map<number, { id: string; name: string; args: string }>();

  add(fragments: NonNullable<OpenAiDelta['tool_calls']>): void {
    for (const frag of fragments) {
      const existing = this.byIndex.get(frag.index) ?? { id: '', name: '', args: '' };
      if (frag.id) existing.id = frag.id;
      if (frag.function?.name) existing.name = frag.function.name;
      if (frag.function?.arguments) existing.args += frag.function.arguments;
      this.byIndex.set(frag.index, existing);
    }
  }

  finish(): ToolCall[] {
    return [...this.byIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, c], i) => ({
        id: c.id || `call_${index}_${i}`,
        name: c.name,
        arguments: c.args || '{}',
      }))
      .filter((c) => c.name !== '');
  }
}

/**
 * Streaming provider for any OpenAI-compatible `/chat/completions` endpoint:
 * LM Studio, DeepSeek, Qwen Coder, Ollama's `/v1`, vLLM, and the OpenAI API.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: string;
  readonly info: LlmModelInfo;
  private readonly options: OpenAiProviderOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiProviderOptions) {
    this.id = options.id;
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.info = { id: options.model, contextWindow: options.contextWindow ?? 32768 };
  }

  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    const url = `${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.options.apiKey) headers.authorization = `Bearer ${this.options.apiKey}`;

    const body: Record<string, unknown> = {
      model: this.options.model,
      messages: request.messages.map(toApiMessage),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.tools && request.tools.length > 0) body.tools = request.tools.map(toApiTool);

    const init: RequestInit = { method: 'POST', headers, body: JSON.stringify(body) };
    if (request.signal) init.signal = request.signal;

    const response = await this.fetchImpl(url, init);
    if (!response.ok || !response.body) {
      const text = response.body ? await response.text() : '';
      throw new ForgewrightError('LLM_REQUEST_FAILED', `LLM request failed (${response.status})`, {
        provider: this.id,
        status: response.status,
        detail: text.slice(0, 500),
      });
    }

    const accumulator = new ToolCallAccumulator();
    let sawToolCalls = false;
    let finishReason: 'stop' | 'length' | 'tool_calls' = 'stop';

    // Keep reading until the stream closes so a trailing usage-only chunk (sent
    // after finish_reason when include_usage is set) is still captured.
    for await (const chunk of parseSseJson<OpenAiStreamChunk>(response.body)) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) {
        yield { type: 'text', delta: delta.content };
      }
      if (delta?.tool_calls && delta.tool_calls.length > 0) {
        sawToolCalls = true;
        accumulator.add(delta.tool_calls);
      }
      if (chunk.usage) {
        yield {
          type: 'usage',
          usage: {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          },
        };
      }
      if (choice?.finish_reason) {
        finishReason =
          choice.finish_reason === 'tool_calls'
            ? 'tool_calls'
            : choice.finish_reason === 'length'
              ? 'length'
              : 'stop';
      }
    }

    if (sawToolCalls) {
      for (const call of accumulator.finish()) yield { type: 'tool_call', call };
      yield { type: 'done', finishReason: 'tool_calls' };
    } else {
      yield { type: 'done', finishReason };
    }
  }
}
