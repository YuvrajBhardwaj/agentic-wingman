import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createContextBuilder, createIndexer } from './factory.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'wingman-index-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(
    join(root, 'src', 'user.ts'),
    'export interface User { id: string }\nexport class UserService { find() {} }\n',
  );
  await writeFile(
    join(root, 'src', 'auth.ts'),
    'import { User } from "./user";\nexport function login(u: User) { return u; }\n',
  );
  await writeFile(join(root, 'README.md'), '# fixture\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('RepoIndexer', () => {
  it('indexes source files into a symbol graph', async () => {
    const indexer = createIndexer(root, () => 0);
    const stats = await indexer.index();
    expect(stats.filesIndexed).toBe(2); // README.md is not a source file

    const graph = indexer.graph();
    expect([...graph.files.keys()].sort()).toEqual(['src/auth.ts', 'src/user.ts']);
    const names = [...graph.symbols.values()].map((s) => s.name).sort();
    expect(names).toEqual(['User', 'UserService', 'login']);

    const authImport = graph.imports.find((i) => i.fromFile === 'src/auth.ts');
    expect(authImport?.toModule).toBe('./user');
    expect(authImport?.external).toBe(false);
  });

  it('skips unchanged files and re-indexes changed ones', async () => {
    const indexer = createIndexer(root, () => 0);
    await indexer.index();

    // No changes: update reports nothing re-indexed.
    const unchanged = await indexer.update(['src/user.ts']);
    expect(unchanged.filesIndexed).toBe(0);

    // Change the file: it should be re-indexed and the graph updated.
    await writeFile(join(root, 'src', 'user.ts'), 'export const NEW = 1;\n');
    const changed = await indexer.update(['src/user.ts']);
    expect(changed.filesIndexed).toBe(1);

    const graph = indexer.graph();
    const userFileSymbols = [...graph.symbols.values()].filter((s) => s.filePath === 'src/user.ts');
    expect(userFileSymbols.map((s) => s.name)).toEqual(['NEW']);
  });

  it('removes symbols when a file is deleted', async () => {
    const indexer = createIndexer(root, () => 0);
    await indexer.index();
    await rm(join(root, 'src', 'auth.ts'));
    await indexer.update(['src/auth.ts']);

    const graph = indexer.graph();
    expect(graph.files.has('src/auth.ts')).toBe(false);
    expect([...graph.symbols.values()].some((s) => s.name === 'login')).toBe(false);
  });
});

describe('LexicalContextBuilder', () => {
  it('retrieves relevant files within the token budget', async () => {
    const indexer = createIndexer(root, () => 0);
    await indexer.index();
    const builder = createContextBuilder(root, indexer);

    const bundle = await builder.build({
      query: 'how does login work for a user',
      tokenBudget: 4000,
    });
    const paths = bundle.chunks.map((c) => c.path);
    expect(paths).toContain('src/auth.ts');
    expect(bundle.totalTokens).toBeLessThanOrEqual(4000);
    expect(bundle.totalTokens).toBeGreaterThan(0);
  });

  it('boosts focused files', async () => {
    const indexer = createIndexer(root, () => 0);
    await indexer.index();
    const builder = createContextBuilder(root, indexer);

    const bundle = await builder.build({
      query: 'unrelated query terms',
      tokenBudget: 4000,
      focusPaths: ['src/user.ts'],
    });
    expect(bundle.chunks[0]?.path).toBe('src/user.ts');
  });
});
