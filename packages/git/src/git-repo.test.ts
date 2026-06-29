import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GitRepo } from './git-repo.js';

let root: string;
let git: GitRepo;

const write = (name: string, content: string): Promise<void> =>
  writeFile(join(root, name), content, 'utf8');
const read = (name: string): Promise<string> => readFile(join(root, name), 'utf8');
const exists = (name: string): Promise<boolean> =>
  stat(join(root, name)).then(
    () => true,
    () => false,
  );

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'fw-git-'));
  git = new GitRepo({ cwd: root });
  await git.init();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('GitRepo', () => {
  it('detects a repository and reports status', async () => {
    expect(await git.isRepo()).toBe(true);
    await write('a.txt', 'hello');
    const status = await git.status();
    expect(status.map((s) => s.path)).toContain('a.txt');
  });

  it('commits changes and returns a sha', async () => {
    await write('a.txt', 'v1');
    const sha = await git.commit('first');
    expect(sha).toMatch(/^[0-9a-f]{7,40}$/);
    expect(await git.status()).toHaveLength(0);
    expect(await git.commit('nothing to do')).toBeUndefined();
  });

  it('snapshots and rolls back tracked changes', async () => {
    await write('a.txt', 'v1');
    await git.commit('init');

    await write('a.txt', 'v2');
    const snap = await git.snapshot('before edits');

    await write('a.txt', 'v3');
    expect(await read('a.txt')).toBe('v3');

    await git.rollback(snap);
    expect(await read('a.txt')).toBe('v2');
  });

  it('rollback removes files created after the snapshot', async () => {
    await write('a.txt', 'v1');
    await git.commit('init');
    const snap = await git.snapshot();

    await write('new-file.txt', 'created after snapshot');
    expect(await exists('new-file.txt')).toBe(true);

    await git.rollback(snap);
    expect(await exists('new-file.txt')).toBe(false);
    expect(await read('a.txt')).toBe('v1');
  });

  it('produces a diff and a change summary', async () => {
    await write('a.txt', 'v1');
    await git.commit('init');
    await write('a.txt', 'v2-changed');

    const diff = await git.diff();
    expect(diff).toContain('a.txt');
    expect(diff).toContain('v2-changed');

    const summary = await git.summarizeChanges();
    expect(summary).toContain('a.txt');
    expect(summary).toMatch(/modified/);
  });
});
