import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { ForgewrightError } from '@forgewright/shared';
import type { GitDiffOptions, GitFileStatus, GitService } from '@forgewright/types';

const execFileAsync = promisify(execFile);

/** Default identity so snapshots/commits work without global git config. */
const IDENTITY_ENV: Record<string, string> = {
  GIT_AUTHOR_NAME: 'Forgewright',
  GIT_AUTHOR_EMAIL: 'forgewright@local',
  GIT_COMMITTER_NAME: 'Forgewright',
  GIT_COMMITTER_EMAIL: 'forgewright@local',
};

export interface GitRepoOptions {
  readonly cwd: string;
  readonly gitBinary?: string;
}

/** Git integration backed by the `git` CLI. */
export class GitRepo implements GitService {
  private readonly cwd: string;
  private readonly bin: string;

  constructor(options: GitRepoOptions) {
    this.cwd = options.cwd;
    this.bin = options.gitBinary ?? 'git';
  }

  private async run(args: readonly string[], env?: Record<string, string>): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.bin, [...args], {
        cwd: this.cwd,
        env: env ? { ...process.env, ...env } : process.env,
        maxBuffer: 32 * 1024 * 1024,
      });
      return stdout;
    } catch (error) {
      throw new ForgewrightError(
        'TOOL_EXECUTION_FAILED',
        `git ${args[0]} failed: ${error instanceof Error ? error.message : String(error)}`,
        { args: args.join(' ') },
        { cause: error },
      );
    }
  }

  async isRepo(): Promise<boolean> {
    try {
      const out = await this.run(['rev-parse', '--is-inside-work-tree']);
      return out.trim() === 'true';
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    await this.run(['init']);
  }

  async status(): Promise<readonly GitFileStatus[]> {
    const out = await this.run(['status', '--porcelain=v1', '-z']);
    const entries = out.split('\0').filter((e) => e !== '');
    const result: GitFileStatus[] = [];
    for (const entry of entries) {
      const index = entry[0] ?? ' ';
      const workingTree = entry[1] ?? ' ';
      let path = entry.slice(3);
      const arrow = path.indexOf(' -> ');
      if (arrow !== -1) path = path.slice(arrow + 4); // renames: take destination
      result.push({ path, index, workingTree });
    }
    return result;
  }

  async diff(options: GitDiffOptions = {}): Promise<string> {
    const args = ['diff'];
    if (options.staged) {
      args.push('--staged');
    } else if (await this.hasHead()) {
      args.push('HEAD');
    }
    if (options.paths && options.paths.length > 0) {
      args.push('--', ...options.paths);
    }
    return this.run(args);
  }

  async currentBranch(): Promise<string | undefined> {
    try {
      const out = (await this.run(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
      return out === '' ? undefined : out;
    } catch {
      return undefined;
    }
  }

  async snapshot(label = 'forgewright snapshot'): Promise<string> {
    const tmpIndex = join(tmpdir(), `fw-index-${crypto.randomUUID()}`);
    const env = { ...IDENTITY_ENV, GIT_INDEX_FILE: tmpIndex };
    try {
      // Stage the entire working tree into a throwaway index, write a tree, and
      // commit it without touching the user's real index, HEAD, or branches.
      await this.run(['add', '-A'], env);
      const tree = (await this.run(['write-tree'], env)).trim();
      const head = await this.revParseHead();
      const args = head
        ? ['commit-tree', tree, '-p', head, '-m', label]
        : ['commit-tree', tree, '-m', label];
      const commit = (await this.run(args, IDENTITY_ENV)).trim();
      return commit;
    } finally {
      await rm(tmpIndex, { force: true });
    }
  }

  async rollback(snapshotId: string): Promise<void> {
    // Restore tracked files to the snapshot, then drop files created since.
    await this.run(['read-tree', '-u', '--reset', snapshotId], IDENTITY_ENV);
    await this.run(['clean', '-fd']);
  }

  async commit(message: string): Promise<string | undefined> {
    const status = await this.status();
    if (status.length === 0) return undefined;
    await this.run(['add', '-A'], IDENTITY_ENV);
    await this.run(['commit', '-m', message, '--no-verify'], IDENTITY_ENV);
    return (await this.run(['rev-parse', 'HEAD'])).trim();
  }

  async summarizeChanges(): Promise<string> {
    const status = await this.status();
    if (status.length === 0) return 'No changes';
    const added = status.filter((s) => s.index === 'A' || s.workingTree === '?').length;
    const modified = status.filter((s) => s.index === 'M' || s.workingTree === 'M').length;
    const deleted = status.filter((s) => s.index === 'D' || s.workingTree === 'D').length;
    const files = status
      .slice(0, 5)
      .map((s) => s.path)
      .join(', ');
    const parts: string[] = [];
    if (added) parts.push(`${added} added`);
    if (modified) parts.push(`${modified} modified`);
    if (deleted) parts.push(`${deleted} deleted`);
    const suffix = status.length > 5 ? `, …+${status.length - 5} more` : '';
    return `Update ${status.length} file(s) (${parts.join(', ')}): ${files}${suffix}`;
  }

  private async hasHead(): Promise<boolean> {
    return (await this.revParseHead()) !== undefined;
  }

  private async revParseHead(): Promise<string | undefined> {
    try {
      return (await this.run(['rev-parse', 'HEAD'])).trim();
    } catch {
      return undefined;
    }
  }
}
