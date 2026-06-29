import type { VectorStore, VectorMatch, VectorQuery, VectorRecord } from '@forgewright/types';

import { cosineSimilarity } from './vector-math.js';

/** Does a record's payload satisfy an equality filter? */
const matchesFilter = (
  payload: Readonly<Record<string, unknown>>,
  filter: Readonly<Record<string, unknown>> | undefined,
): boolean => {
  if (!filter) return true;
  for (const [key, value] of Object.entries(filter)) {
    if (payload[key] !== value) return false;
  }
  return true;
};

/**
 * Exact k-nearest-neighbor vector store using brute-force cosine similarity.
 * Correct and dependency-free; ideal for local/personal-scale data. A Qdrant or
 * HNSW-backed store implements the same {@link VectorStore} interface for larger
 * corpora.
 */
export class InMemoryVectorStore implements VectorStore {
  readonly collection: string;
  private readonly records = new Map<string, VectorRecord>();

  constructor(collection = 'default') {
    this.collection = collection;
  }

  async upsert(records: readonly VectorRecord[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.id, {
        id: record.id,
        vector: [...record.vector],
        payload: { ...record.payload },
      });
    }
  }

  async query(query: VectorQuery): Promise<readonly VectorMatch[]> {
    const matches: VectorMatch[] = [];
    for (const record of this.records.values()) {
      if (!matchesFilter(record.payload, query.filter)) continue;
      matches.push({
        id: record.id,
        score: cosineSimilarity(query.vector, record.vector),
        payload: record.payload,
      });
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, query.limit);
  }

  async delete(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.records.delete(id);
  }

  async count(): Promise<number> {
    return this.records.size;
  }
}
