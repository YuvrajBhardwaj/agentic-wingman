import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  ContextBuilder,
  ContextBundle,
  ContextChunk,
  ContextQuery,
  Indexer,
} from '@forgewright/types';

export interface ContextBuilderOptions {
  readonly root: string;
  readonly indexer: Indexer;
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 2);

interface ScoredFile {
  readonly path: string;
  readonly score: number;
}

/**
 * Token-budgeted context builder using lexical relevance over the symbol graph.
 * It ranks files by query-term overlap with their paths and symbol names (plus
 * a strong boost for focused files), then packs file contents up to the budget.
 * Embedding-based semantic ranking layers on in a later phase behind the same
 * {@link ContextBuilder} contract.
 */
export class LexicalContextBuilder implements ContextBuilder {
  constructor(private readonly options: ContextBuilderOptions) {}

  async build(query: ContextQuery, signal?: AbortSignal): Promise<ContextBundle> {
    const graph = this.options.indexer.graph();
    const terms = new Set(tokenize(query.query));
    const focus = new Set(query.focusPaths ?? []);

    const scored: ScoredFile[] = [];
    for (const file of graph.files.values()) {
      const symbolNames = file.symbols
        .map((id) => graph.symbols.get(id)?.name ?? '')
        .join(' ')
        .toLowerCase();
      const pathLower = file.path.toLowerCase();

      let score = 0;
      for (const term of terms) {
        if (pathLower.includes(term)) score += 3;
        if (symbolNames.includes(term)) score += 2;
      }
      if (focus.has(file.path)) score += 100;
      if (score > 0) scored.push({ path: file.path, score });
    }

    scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

    const chunks: ContextChunk[] = [];
    let usedTokens = 0;

    for (const { path, score } of scored) {
      if (signal?.aborted) break;
      if (usedTokens >= query.tokenBudget) break;

      let content: string;
      try {
        content = await readFile(join(this.options.root, path), 'utf8');
      } catch {
        continue;
      }

      const remaining = query.tokenBudget - usedTokens;
      const maxChars = remaining * 4;
      const sliced =
        content.length > maxChars ? `${content.slice(0, maxChars)}\n/* …truncated… */` : content;
      const tokens = estimateTokens(sliced);

      chunks.push({ source: 'file', path, content: sliced, score, tokens });
      usedTokens += tokens;
    }

    return { chunks, totalTokens: usedTokens };
  }
}
