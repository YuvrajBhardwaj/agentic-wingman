import { createEmbedder, createVectorStore } from '@forgewright/embeddings';
import type { EmbeddingConfig, MemoryStore, VectorConfig } from '@forgewright/types';

import { InMemoryKnowledgeGraph } from './knowledge-graph.js';
import { VectorMemoryStore } from './memory-store.js';

export interface CreateMemoryOptions {
  readonly embedding: EmbeddingConfig;
  readonly vector: VectorConfig;
  readonly ollamaBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly generateId?: () => string;
}

/** Build a vector-backed memory store from config. */
export const createMemoryStore = (options: CreateMemoryOptions): MemoryStore =>
  new VectorMemoryStore({
    embedder: createEmbedder(options.embedding, options.ollamaBaseUrl, options.fetchImpl),
    vectorStore: createVectorStore(options.vector, 'memories'),
    ...(options.now ? { now: options.now } : {}),
    ...(options.generateId ? { generateId: options.generateId } : {}),
  });

/** Build an empty knowledge graph. */
export const createKnowledgeGraph = (generateId?: () => string): InMemoryKnowledgeGraph =>
  new InMemoryKnowledgeGraph(generateId ? { generateId } : {});
