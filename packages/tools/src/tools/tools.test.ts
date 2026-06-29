import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemorySink, StructuredLogger } from '@forgewright/shared';
import type { ToolContext } from '@forgewright/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerBuiltinTools } from '../builtins.js';
import { SandboxedFs } from '../fs.js';
import { DefaultPermissionBroker } from '../permission-broker.js';
import { DefaultToolRegistry } from '../registry.js';

import type { GlobSearchResult } from './glob-search.js';
import type { GrepSearchResult } from './grep-search.js';
import type { ReadFileResult } from './read-file.js';
import type { WriteFileResult } from './write-file.js';

let root: string;
const registry = new DefaultToolRegistry();
registerBuiltinTools(registry);

const ctx = (): ToolContext => ({
  cwd: root,
  signal: new AbortController().signal,
  permissions: new DefaultPermissionBroker({ approver: async () => true }),
  logger: new StructuredLogger({ sink: new MemorySink() }),
  fs: new SandboxedFs(root),
});

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'wingman-tools-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1;\nexport function foo() {}\n');
  await writeFile(join(root, 'src', 'b.ts'), 'import { a } from "./a";\nconst b = a + 1;\n');
  await writeFile(join(root, 'README.md'), '# fixture\n');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('builtin file tools', () => {
  it('reads a file', async () => {
    const res = (await registry.execute(
      'read_file',
      { path: 'src/a.ts' },
      ctx(),
    )) as ReadFileResult;
    expect(res.content).toContain('export function foo');
    expect(res.totalLines).toBe(3);
  });

  it('reads a line range', async () => {
    const res = (await registry.execute(
      'read_file',
      { path: 'src/a.ts', startLine: 2, endLine: 2 },
      ctx(),
    )) as ReadFileResult;
    expect(res.content).toBe('export function foo() {}');
  });

  it('writes a new file', async () => {
    const res = (await registry.execute(
      'write_file',
      { path: 'src/c.ts', content: 'export const c = 3;\n' },
      ctx(),
    )) as WriteFileResult;
    expect(res.created).toBe(true);
    const read = (await registry.execute(
      'read_file',
      { path: 'src/c.ts' },
      ctx(),
    )) as ReadFileResult;
    expect(read.content).toContain('c = 3');
  });

  it('globs files', async () => {
    const res = (await registry.execute(
      'glob_search',
      { pattern: 'src/**/*.ts' },
      ctx(),
    )) as GlobSearchResult;
    expect(res.matches).toContain('src/a.ts');
    expect(res.matches).toContain('src/b.ts');
    expect(res.matches).not.toContain('README.md');
  });

  it('greps file contents', async () => {
    const res = (await registry.execute(
      'grep_search',
      { pattern: 'export function', include: 'src/**/*.ts' },
      ctx(),
    )) as GrepSearchResult;
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]?.path).toBe('src/a.ts');
    expect(res.matches[0]?.line).toBe(2);
  });

  it('refuses to read outside the sandbox', async () => {
    await expect(
      registry.execute('read_file', { path: '../../../etc/passwd' }, ctx()),
    ).rejects.toThrowError(/sandbox/);
  });

  it('denies a write when permission is rejected', async () => {
    const denied: ToolContext = {
      ...ctx(),
      permissions: new DefaultPermissionBroker({ approver: async () => false }),
    };
    await expect(
      registry.execute('write_file', { path: 'src/d.ts', content: 'x' }, denied),
    ).rejects.toThrowError(/denied/);
  });
});
