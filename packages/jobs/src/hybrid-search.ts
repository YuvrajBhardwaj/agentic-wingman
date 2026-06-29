import type { Memory, MemoryKind, MemoryStore } from '@forgewright/types';

export type SearchSignal = 'semantic' | 'keyword';

export interface HybridResult {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly content: string;
  readonly score: number;
  /** Which retrievers surfaced this item. */
  readonly signals: readonly SearchSignal[];
}

export interface HybridSearchOptions {
  readonly limit?: number;
  /** Reciprocal-rank-fusion constant (higher = flatter weighting). */
  readonly rrfK?: number;
  readonly kinds?: readonly MemoryKind[];
}

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 2);

const keywordScore = (content: string, terms: readonly string[]): number => {
  if (terms.length === 0) return 0;
  const hay = content.toLowerCase();
  let score = 0;
  for (const term of terms) if (hay.includes(term)) score += 1;
  return score;
};

/**
 * Unified personal-knowledge-base search blending semantic (vector) and keyword
 * (full-text) retrieval over the memory store via reciprocal rank fusion. Each
 * result records which signals matched. Graph traversal layers on where a
 * knowledge graph is available.
 */
export class HybridSearch {
  constructor(private readonly memory: MemoryStore) {}

  async search(query: string, options: HybridSearchOptions = {}): Promise<readonly HybridResult[]> {
    const limit = options.limit ?? 10;
    const k = options.rrfK ?? 60;
    const pool = Math.max(limit * 3, limit);

    const semantic = await this.memory.retrieve({
      query,
      limit: pool,
      ...(options.kinds ? { kinds: options.kinds } : {}),
    });

    const all = await this.memory.all();
    const terms = tokenize(query);
    const keyword = all
      .filter((m) => !options.kinds || options.kinds.includes(m.kind))
      .map((m) => ({ m, score: keywordScore(m.content, terms) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, pool)
      .map((x) => x.m);

    const fused = new Map<string, { memory: Memory; score: number; signals: Set<SearchSignal> }>();
    const fuse = (items: readonly Memory[], signal: SearchSignal): void => {
      items.forEach((memory, rank) => {
        const existing = fused.get(memory.id) ?? {
          memory,
          score: 0,
          signals: new Set<SearchSignal>(),
        };
        existing.score += 1 / (k + rank);
        existing.signals.add(signal);
        fused.set(memory.id, existing);
      });
    };
    fuse(semantic, 'semantic');
    fuse(keyword, 'keyword');

    return [...fused.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => ({
        id: entry.memory.id,
        kind: entry.memory.kind,
        content: entry.memory.content,
        score: entry.score,
        signals: [...entry.signals],
      }));
  }
}
