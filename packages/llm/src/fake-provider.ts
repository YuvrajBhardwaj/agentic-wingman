import type { ChatChunk, ChatRequest, LlmModelInfo, LlmProvider } from '@forgewright/types';

/**
 * A scripted provider for deterministic tests. Each call to `chat` returns the
 * next scripted turn's chunks. Captures the requests it received for assertions.
 */
export class FakeLlmProvider implements LlmProvider {
  readonly id: string;
  readonly info: LlmModelInfo;
  readonly requests: ChatRequest[] = [];
  private turn = 0;

  constructor(
    private readonly script: readonly (readonly ChatChunk[])[],
    id = 'fake',
  ) {
    this.id = id;
    this.info = { id, contextWindow: 8192 };
  }

  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    this.requests.push(request);
    const chunks = this.script[this.turn] ?? [{ type: 'done', finishReason: 'stop' }];
    this.turn += 1;
    for (const chunk of chunks) {
      if (request.signal?.aborted) {
        yield { type: 'done', finishReason: 'error' };
        return;
      }
      yield chunk;
    }
  }
}

/** Convenience builders for scripting fake turns. */
export const textChunks = (text: string): ChatChunk[] => [
  { type: 'text', delta: text },
  { type: 'done', finishReason: 'stop' },
];

export const toolCallChunks = (
  name: string,
  args: Record<string, unknown>,
  id = 'call_0',
): ChatChunk[] => [
  { type: 'tool_call', call: { id, name, arguments: JSON.stringify(args) } },
  { type: 'done', finishReason: 'tool_calls' },
];
