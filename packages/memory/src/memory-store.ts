import type { Embedder, Memory, MemoryQuery, MemoryStore, VectorStore } from '@forgewright/types';

export interface VectorMemoryStoreOptions {
  readonly embedder: Embedder;
  readonly vectorStore: VectorStore;
  /** Time source; defaults to Date.now. */
  readonly now?: () => number;
  /** Id generator; defaults to crypto.randomUUID. */
  readonly generateId?: () => string;
  /** Weight applied to a memory's importance when ranking. */
  readonly importanceWeight?: number;
}

/**
 * Semantic long-term memory. Each memory's content is embedded and stored in a
 * vector store; retrieval ranks by cosine similarity blended with the memory's
 * importance. Records are also held for listing and exact lookup.
 */
export class VectorMemoryStore implements MemoryStore {
  private readonly records = new Map<string, Memory>();
  private readonly embedder: Embedder;
  private readonly vectorStore: VectorStore;
  private readonly now: () => number;
  private readonly generateId: () => string;
  private readonly importanceWeight: number;

  constructor(options: VectorMemoryStoreOptions) {
    this.embedder = options.embedder;
    this.vectorStore = options.vectorStore;
    this.now = options.now ?? (() => Date.now());
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
    this.importanceWeight = options.importanceWeight ?? 0.05;
  }

  async remember(input: Omit<Memory, 'id' | 'createdAt' | 'updatedAt'>): Promise<Memory> {
    const timestamp = this.now();
    const memory: Memory = {
      id: this.generateId(),
      kind: input.kind,
      content: input.content,
      tags: [...input.tags],
      importance: input.importance,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const [vector] = await this.embedder.embed([memory.content]);
    await this.vectorStore.upsert([
      {
        id: memory.id,
        vector: vector ?? [],
        payload: { kind: memory.kind, importance: memory.importance },
      },
    ]);
    this.records.set(memory.id, memory);
    return memory;
  }

  async retrieve(query: MemoryQuery): Promise<readonly Memory[]> {
    if (this.records.size === 0) return [];
    const [vector] = await this.embedder.embed([query.query]);
    // Over-fetch, then filter by kind and re-rank with importance.
    const matches = await this.vectorStore.query({
      vector: vector ?? [],
      limit: Math.max(query.limit * 4, query.limit),
    });

    const kinds = query.kinds ? new Set(query.kinds) : undefined;
    const ranked = matches
      .map((m) => ({ memory: this.records.get(m.id), score: m.score }))
      .filter((r): r is { memory: Memory; score: number } => r.memory !== undefined)
      .filter((r) => !kinds || kinds.has(r.memory.kind))
      .map((r) => ({
        memory: r.memory,
        score: r.score + r.memory.importance * this.importanceWeight,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit);

    return ranked.map((r) => r.memory);
  }

  async forget(id: string): Promise<void> {
    this.records.delete(id);
    await this.vectorStore.delete([id]);
  }

  async all(): Promise<readonly Memory[]> {
    return [...this.records.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }
}
