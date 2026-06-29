import { ForgewrightError } from '@forgewright/shared';
import type { Embedder } from '@forgewright/types';

export interface OllamaEmbedderOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly dimensions: number;
  readonly fetchImpl?: typeof fetch;
}

interface OllamaEmbedResponse {
  readonly embeddings?: readonly number[][];
  readonly embedding?: readonly number[];
}

/**
 * Real embeddings via Ollama's `/api/embed` endpoint (e.g. bge-small-en-v1.5).
 * Requires a running Ollama instance with the model pulled.
 */
export class OllamaEmbedder implements Embedder {
  readonly model: string;
  readonly dimensions: number;
  private readonly options: OllamaEmbedderOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaEmbedderOptions) {
    this.options = options;
    this.model = options.model;
    this.dimensions = options.dimensions;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async embed(texts: readonly string[], signal?: AbortSignal): Promise<readonly number[][]> {
    if (texts.length === 0) return [];
    const url = `${this.options.baseUrl.replace(/\/$/, '')}/api/embed`;
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    };
    if (signal) init.signal = signal;

    const response = await this.fetchImpl(url, init);
    if (!response.ok) {
      throw new ForgewrightError(
        'LLM_REQUEST_FAILED',
        `Embedding request failed (${response.status})`,
        {
          model: this.model,
          status: response.status,
        },
      );
    }
    const data = (await response.json()) as OllamaEmbedResponse;
    if (data.embeddings) return data.embeddings.map((e) => [...e]);
    if (data.embedding) return [[...data.embedding]];
    throw new ForgewrightError('LLM_REQUEST_FAILED', 'Embedding response had no vectors', {
      model: this.model,
    });
  }
}
