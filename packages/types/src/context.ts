export type SymbolKind =
  'function' | 'method' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 'constant';

export interface SourceRange {
  readonly startLine: number;
  readonly endLine: number;
}

export interface SymbolNode {
  readonly id: string;
  readonly name: string;
  readonly kind: SymbolKind;
  readonly filePath: string;
  readonly range: SourceRange;
  /** Symbol ids this symbol references (calls, extends, implements). */
  readonly references: readonly string[];
  readonly exported: boolean;
}

export interface ImportEdge {
  readonly fromFile: string;
  /** Resolved file path, or the raw module specifier if external. */
  readonly toModule: string;
  readonly external: boolean;
  readonly symbols: readonly string[];
}

export interface FileNode {
  readonly path: string;
  readonly language: string;
  readonly hash: string;
  readonly size: number;
  readonly symbols: readonly string[];
}

export interface RepoGraph {
  readonly files: ReadonlyMap<string, FileNode>;
  readonly symbols: ReadonlyMap<string, SymbolNode>;
  readonly imports: readonly ImportEdge[];
}

/** Tree-sitter-backed, per-language symbol/import extraction. */
export interface SymbolExtractor {
  readonly languages: readonly string[];
  supports(filePath: string): boolean;
  extract(
    filePath: string,
    source: string,
  ): Promise<{
    readonly symbols: readonly SymbolNode[];
    readonly imports: readonly ImportEdge[];
  }>;
}

export interface IndexStats {
  readonly filesIndexed: number;
  readonly symbols: number;
  readonly durationMs: number;
}

/** Builds and incrementally maintains the repository graph. */
export interface Indexer {
  index(signal?: AbortSignal): Promise<IndexStats>;
  update(changedPaths: readonly string[], signal?: AbortSignal): Promise<IndexStats>;
  graph(): RepoGraph;
}

export interface ContextChunk {
  readonly source: 'file' | 'symbol' | 'memory' | 'git' | 'edit';
  readonly path?: string;
  readonly content: string;
  readonly score: number;
  readonly tokens: number;
}

export interface ContextBundle {
  readonly chunks: readonly ContextChunk[];
  readonly totalTokens: number;
}

export interface ContextQuery {
  readonly query: string;
  readonly tokenBudget: number;
  /** Files the user is actively looking at, ranked higher. */
  readonly focusPaths?: readonly string[];
}

/** Assembles token-budgeted context for an agent turn. */
export interface ContextBuilder {
  build(query: ContextQuery, signal?: AbortSignal): Promise<ContextBundle>;
}
