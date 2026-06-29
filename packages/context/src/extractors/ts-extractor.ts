import type { ImportEdge, SymbolKind, SymbolNode, SymbolExtractor } from '@forgewright/types';

import { isTypeScriptFamily, languageForPath } from '../languages.js';

/** Find the line index where a `{ ... }` block opened at/after `startIdx` closes. */
const findBlockEnd = (lines: readonly string[], startIdx: number): number => {
  let depth = 0;
  let seen = false;
  for (let i = startIdx; i < lines.length; i += 1) {
    for (const ch of lines[i] ?? '') {
      if (ch === '{') {
        depth += 1;
        seen = true;
      } else if (ch === '}') {
        depth -= 1;
      }
    }
    if (seen && depth <= 0) return i;
  }
  return startIdx;
};

const STRIP_PREFIX = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?/;

interface Declaration {
  readonly kind: SymbolKind;
  readonly name: string;
  /** Whether the construct uses a `{ }` block whose end should be found. */
  readonly block: boolean;
}

/** Identify a top-level declaration on a single (de-prefixed) line. */
const matchDeclaration = (body: string): Declaration | undefined => {
  let m: RegExpMatchArray | null;
  if ((m = body.match(/^class\s+([A-Za-z0-9_$]+)/))) {
    return { kind: 'class', name: m[1] as string, block: true };
  }
  if ((m = body.match(/^interface\s+([A-Za-z0-9_$]+)/))) {
    return { kind: 'interface', name: m[1] as string, block: true };
  }
  if ((m = body.match(/^(?:const\s+)?enum\s+([A-Za-z0-9_$]+)/))) {
    return { kind: 'enum', name: m[1] as string, block: true };
  }
  if ((m = body.match(/^type\s+([A-Za-z0-9_$]+)/))) {
    return { kind: 'type', name: m[1] as string, block: false };
  }
  if ((m = body.match(/^(?:async\s+)?function\*?\s+([A-Za-z0-9_$]+)/))) {
    return { kind: 'function', name: m[1] as string, block: true };
  }
  if ((m = body.match(/^(const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*(.*)$/))) {
    const keyword = m[1] as string;
    const name = m[2] as string;
    const rhs = m[3] ?? '';
    const isFn = /^(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z0-9_$]+\s*=>)/.test(
      rhs,
    );
    if (isFn) return { kind: 'function', name, block: rhs.includes('{') };
    return { kind: keyword === 'const' ? 'constant' : 'variable', name, block: false };
  }
  return undefined;
};

/** Parse import / re-export edges from source. */
const parseImports = (filePath: string, source: string): ImportEdge[] => {
  const edges: ImportEdge[] = [];
  const seen = new Set<string>();

  const push = (module: string, symbols: readonly string[]): void => {
    const key = `${module}|${symbols.join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({
      fromFile: filePath,
      toModule: module,
      external: !module.startsWith('.'),
      symbols,
    });
  };

  // `import ... from 'mod'` and `export ... from 'mod'`
  const fromRe = /(?:import|export)\s+(?:type\s+)?([^'";]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (let m = fromRe.exec(source); m !== null; m = fromRe.exec(source)) {
    push(m[2] as string, parseClause(m[1] as string));
  }

  // Side-effect imports: `import 'mod'`
  const sideRe = /import\s+['"]([^'"]+)['"]/g;
  for (let m = sideRe.exec(source); m !== null; m = sideRe.exec(source)) {
    push(m[1] as string, []);
  }

  return edges;
};

/** Extract imported symbol names from an import clause. */
const parseClause = (clause: string): string[] => {
  const names: string[] = [];
  const trimmed = clause.trim();
  if (trimmed === '' || trimmed === '*') return names;

  const namespace = trimmed.match(/\*\s+as\s+([A-Za-z0-9_$]+)/);
  if (namespace) names.push(namespace[1] as string);

  const braces = trimmed.match(/\{([^}]*)\}/);
  if (braces) {
    for (const part of (braces[1] as string).split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.push(name);
    }
  }

  const defaultName = trimmed
    .replace(/\{[^}]*\}/, '')
    .replace(/\*\s+as\s+[A-Za-z0-9_$]+/, '')
    .split(',')[0]
    ?.trim();
  if (defaultName && /^[A-Za-z0-9_$]+$/.test(defaultName)) names.push(defaultName);

  return [...new Set(names)];
};

/**
 * Heuristic symbol/import extractor for the TypeScript/JavaScript family.
 * Implements the {@link SymbolExtractor} contract; a Tree-sitter-backed
 * extractor can replace it behind the same interface for broader language
 * support and exact parsing.
 */
export class TsSymbolExtractor implements SymbolExtractor {
  readonly languages = ['typescript', 'tsx', 'javascript', 'jsx'] as const;

  supports(filePath: string): boolean {
    const language = languageForPath(filePath);
    return language !== undefined && isTypeScriptFamily(language);
  }

  async extract(
    filePath: string,
    source: string,
  ): Promise<{ symbols: readonly SymbolNode[]; imports: readonly ImportEdge[] }> {
    const lines = source.split('\n');
    const symbols: SymbolNode[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i] ?? '';
      const trimmed = raw.trimStart();
      const exported = /^export\b/.test(trimmed);
      const topLevel = raw.length === trimmed.length; // no leading whitespace
      if (!exported && !topLevel) continue;

      const body = trimmed.replace(STRIP_PREFIX, '');
      const decl = matchDeclaration(body);
      if (!decl) continue;

      const endLine = decl.block ? findBlockEnd(lines, i) : i;
      symbols.push({
        id: `${filePath}:${decl.kind}:${decl.name}`,
        name: decl.name,
        kind: decl.kind,
        filePath,
        range: { startLine: i + 1, endLine: endLine + 1 },
        references: [],
        exported,
      });
    }

    return { symbols, imports: parseImports(filePath, source) };
  }
}
