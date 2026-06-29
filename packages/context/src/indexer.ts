import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { walkFiles } from '@forgewright/tools';
import type {
  FileNode,
  ImportEdge,
  Indexer,
  IndexStats,
  RepoGraph,
  SymbolExtractor,
  SymbolNode,
} from '@forgewright/types';

import { languageForPath } from './languages.js';

export interface RepoIndexerOptions {
  readonly root: string;
  readonly extractors: readonly SymbolExtractor[];
  /** Injected time source for stats; defaults to Date.now. */
  readonly now?: () => number;
  readonly maxFileBytes?: number;
}

const hashContent = (content: string): string =>
  createHash('sha1').update(content).digest('hex').slice(0, 16);

/**
 * Builds and incrementally maintains the repository graph (files, symbols,
 * imports). Re-indexing is content-hash gated, so unchanged files are skipped.
 * The graph is held in memory; durable persistence arrives with the storage
 * layer in a later phase.
 */
export class RepoIndexer implements Indexer {
  private readonly files = new Map<string, FileNode>();
  private readonly symbols = new Map<string, SymbolNode>();
  private readonly importsByFile = new Map<string, ImportEdge[]>();
  private readonly now: () => number;
  private readonly maxFileBytes: number;

  constructor(private readonly options: RepoIndexerOptions) {
    this.now = options.now ?? (() => Date.now());
    this.maxFileBytes = options.maxFileBytes ?? 512 * 1024;
  }

  private extractorFor(path: string): SymbolExtractor | undefined {
    return this.options.extractors.find((e) => e.supports(path));
  }

  async index(signal?: AbortSignal): Promise<IndexStats> {
    const start = this.now();
    const paths = await walkFiles(this.options.root, signal ? { signal } : {});
    let filesIndexed = 0;
    for (const path of paths) {
      if (signal?.aborted) break;
      if (await this.processFile(path)) filesIndexed += 1;
    }
    return { filesIndexed, symbols: this.symbols.size, durationMs: this.now() - start };
  }

  async update(changedPaths: readonly string[], signal?: AbortSignal): Promise<IndexStats> {
    const start = this.now();
    let filesIndexed = 0;
    for (const path of changedPaths) {
      if (signal?.aborted) break;
      const abs = join(this.options.root, path);
      const exists = await stat(abs).then(
        () => true,
        () => false,
      );
      if (!exists) {
        this.removeFile(path);
        continue;
      }
      // Hash-gated: only re-extract if the content actually changed.
      if (await this.processFile(path)) filesIndexed += 1;
    }
    return { filesIndexed, symbols: this.symbols.size, durationMs: this.now() - start };
  }

  graph(): RepoGraph {
    const imports: ImportEdge[] = [];
    for (const edges of this.importsByFile.values()) imports.push(...edges);
    return { files: this.files, symbols: this.symbols, imports };
  }

  private removeFile(path: string): void {
    const existing = this.files.get(path);
    if (existing) {
      for (const id of existing.symbols) this.symbols.delete(id);
    }
    this.files.delete(path);
    this.importsByFile.delete(path);
  }

  /** Returns true if the file was (re)indexed, false if skipped/unchanged. */
  private async processFile(path: string, force = false): Promise<boolean> {
    const extractor = this.extractorFor(path);
    const language = languageForPath(path);
    if (!extractor || !language) return false;

    const abs = join(this.options.root, path);
    let content: string;
    let size: number;
    try {
      const info = await stat(abs);
      if (info.size > this.maxFileBytes) return false;
      size = info.size;
      content = await readFile(abs, 'utf8');
    } catch {
      return false;
    }

    const hash = hashContent(content);
    const previous = this.files.get(path);
    if (!force && previous && previous.hash === hash) return false;

    // Replace any prior symbols for this file.
    this.removeFile(path);

    const { symbols, imports } = await extractor.extract(path, content);
    for (const symbol of symbols) this.symbols.set(symbol.id, symbol);
    this.importsByFile.set(path, [...imports]);
    this.files.set(path, {
      path,
      language,
      hash,
      size,
      symbols: symbols.map((s) => s.id),
    });
    return true;
  }
}
