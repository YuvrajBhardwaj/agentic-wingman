export interface Embedder {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: readonly string[], signal?: AbortSignal): Promise<readonly number[][]>;
}

export interface VectorRecord {
  readonly id: string;
  readonly vector: readonly number[];
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface VectorMatch {
  readonly id: string;
  readonly score: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface VectorQuery {
  readonly vector: readonly number[];
  readonly limit: number;
  readonly filter?: Readonly<Record<string, unknown>>;
}

/** Abstraction over the vector store (in-process HNSW or Qdrant). */
export interface VectorStore {
  readonly collection: string;
  upsert(records: readonly VectorRecord[]): Promise<void>;
  query(query: VectorQuery): Promise<readonly VectorMatch[]>;
  delete(ids: readonly string[]): Promise<void>;
  count(): Promise<number>;
}
