import type { Embedder, EmbeddingConfig, VectorConfig, VectorStore } from '@forgewright/types';

import { HashingEmbedder } from './hashing-embedder.js';
import { InMemoryVectorStore } from './in-memory-vector-store.js';
import { OllamaEmbedder } from './ollama-embedder.js';

/**
 * Build an embedder from config. `local` uses the offline hashing embedder;
 * `ollama` uses a running Ollama instance for real bge embeddings. (`openai`
 * support layers on later behind the same interface.)
 */
export const createEmbedder = (
  config: EmbeddingConfig,
  ollamaBaseUrl = 'http://localhost:11434',
  fetchImpl?: typeof fetch,
): Embedder => {
  if (config.provider === 'ollama') {
    return new OllamaEmbedder({
      baseUrl: ollamaBaseUrl,
      model: config.model,
      dimensions: config.dimensions,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  }
  return new HashingEmbedder(config.dimensions);
};

/** Build a vector store from config. Local mode uses the in-process store. */
export const createVectorStore = (config: VectorConfig, collection = 'default'): VectorStore => {
  // Qdrant support attaches here behind the same interface; local mode is in-process.
  void config;
  return new InMemoryVectorStore(collection);
};
