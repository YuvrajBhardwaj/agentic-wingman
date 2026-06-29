import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PersistentShell } from './persistent-shell.js';

import { classifyCommand } from './index.js';

let root: string;
let shell: PersistentShell;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'fw-shell-'));
});
afterEach(async () => {
  await shell?.dispose();
  // A just-killed shell can briefly hold the cwd handle on Windows (EBUSY).
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe('PersistentShell', () => {
  it('runs a command and captures output and a zero exit code', async () => {
    shell = new PersistentShell({ cwd: root });
    const result = await shell.run('echo hello world');
    expect(result.output).toContain('hello world');
    expect(result.exitCode).toBe(0);
  });

  it('reports non-zero exit codes', async () => {
    shell = new PersistentShell({ cwd: root });
    const result = await shell.run('false');
    expect(result.exitCode).toBe(1);
  });

  it('persists environment across commands', async () => {
    shell = new PersistentShell({ cwd: root });
    await shell.run('export FORGE_TEST=persisted');
    const result = await shell.run('echo $FORGE_TEST');
    expect(result.output).toContain('persisted');
  });

  it('persists the working directory across commands', async () => {
    shell = new PersistentShell({ cwd: root });
    await shell.run('mkdir sub && cd sub');
    const result = await shell.run('basename "$PWD"');
    expect(result.output).toContain('sub');
  });

  it('streams output chunks', async () => {
    const chunks: string[] = [];
    shell = new PersistentShell({ cwd: root, onData: (c) => chunks.push(c) });
    await shell.run('printf "a\\nb\\nc\\n"');
    expect(chunks.join('')).toContain('a\nb\nc');
  });

  it('interrupts a long-running command', async () => {
    shell = new PersistentShell({ cwd: root });
    const pending = shell.run('sleep 5');
    setTimeout(() => shell.interrupt(), 50);
    await expect(pending).rejects.toThrow(/interrupted|terminated/i);
    expect(shell.isAlive).toBe(false);
  });

  it('re-exports command classification', () => {
    expect(classifyCommand('rm -rf /')).toBe('destructive');
    expect(classifyCommand('ls')).toBe('read-only');
  });
});
