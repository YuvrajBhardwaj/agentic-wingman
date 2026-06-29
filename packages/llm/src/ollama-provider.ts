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

import { parseNdjson } from './sse.js';

export interface OllamaProviderOptions {
  readonly id: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly contextWindow?: number;
  readonly fetchImpl?: typeof fetch;
}

interface OllamaToolCall {
  readonly function?: { readonly name?: string; readonly arguments?: unknown };
}

interface OllamaStreamChunk {
  readonly message?: {
    readonly content?: string;
    readonly tool_calls?: readonly OllamaToolCall[];
  };
  readonly done?: boolean;
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
}

const toApiMessage = (m: ChatMessage): Record<string, unknown> => {
  const base: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.toolCalls && m.toolCalls.length > 0) {
    base.tool_calls = m.toolCalls.map((c) => ({
      function: { name: c.name, arguments: safeParse(c.arguments) },
    }));
  }
  return base;
};

const safeParse = (json: string): unknown => {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
};

const toApiTool = (spec: ToolSpec): Record<string, unknown> => ({
  type: 'function',
  function: { name: spec.name, description: spec.description, parameters: spec.parameters },
});

/**
 * Provider for Ollama's native `/api/chat` streaming endpoint (NDJSON). Use this
 * for full Ollama feature support; the OpenAI-compatible provider also works
 * against Ollama's `/v1` endpoint.
 */
export class OllamaProvider implements LlmProvider {
  readonly id: string;
  readonly info: LlmModelInfo;
  private readonly options: OllamaProviderOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaProviderOptions) {
    this.id = options.id;
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.info = { id: options.model, contextWindow: options.contextWindow ?? 32768 };
  }

  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    const url = `${this.options.baseUrl.replace(/\/$/, '')}/api/chat`;
    const body: Record<string, unknown> = {
      model: this.options.model,
      messages: request.messages.map(toApiMessage),
      stream: true,
    };
    if (request.tools && request.tools.length > 0) body.tools = request.tools.map(toApiTool);
    const options: Record<string, unknown> = {};
    if (request.temperature !== undefined) options.temperature = request.temperature;
    if (request.maxTokens !== undefined) options.num_predict = request.maxTokens;
    if (Object.keys(options).length > 0) body.options = options;

    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    };
    if (request.signal) init.signal = request.signal;

    const response = await this.fetchImpl(url, init);
    if (!response.ok || !response.body) {
      throw new ForgewrightError(
        'LLM_REQUEST_FAILED',
        `Ollama request failed (${response.status})`,
        {
          provider: this.id,
          status: response.status,
        },
      );
    }

    const toolCalls: ToolCall[] = [];

    for await (const chunk of parseNdjson<OllamaStreamChunk>(response.body)) {
      const content = chunk.message?.content;
      if (content) yield { type: 'text', delta: content };

      const calls = chunk.message?.tool_calls;
      if (calls) {
        for (const call of calls) {
          const name = call.function?.name;
          if (!name) continue;
          toolCalls.push({
            id: `call_${toolCalls.length}`,
            name,
            arguments: JSON.stringify(call.function?.arguments ?? {}),
          });
        }
      }

      if (chunk.done) {
        if (chunk.prompt_eval_count !== undefined || chunk.eval_count !== undefined) {
          const prompt = chunk.prompt_eval_count ?? 0;
          const completion = chunk.eval_count ?? 0;
          yield {
            type: 'usage',
            usage: {
              promptTokens: prompt,
              completionTokens: completion,
              totalTokens: prompt + completion,
            },
          };
        }
        for (const call of toolCalls) yield { type: 'tool_call', call };
        yield { type: 'done', finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop' };
        return;
      }
    }

    yield { type: 'done', finishReason: 'stop' };
  }
}
