import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** Directories never descended into during a workspace walk. */
export const DEFAULT_IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.turbo',
  'dist',
  'build',
  'coverage',
  '.forgewright',
  '.next',
  '.cache',
]);

export interface WalkOptions {
  readonly ignoredDirs?: ReadonlySet<string>;
  readonly maxFiles?: number;
  readonly signal?: AbortSignal;
}

/**
 * Recursively list files under `root`, returning workspace-relative POSIX
 * paths. Ignored directories are skipped. Bounded by `maxFiles`.
 */
export const walkFiles = async (root: string, options: WalkOptions = {}): Promise<string[]> => {
  const ignored = options.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
  const maxFiles = options.maxFiles ?? 20000;
  const results: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    if (results.length >= maxFiles) return;
    if (options.signal?.aborted) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir — skip
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignored.has(entry.name)) continue;
        await walk(abs);
      } else if (entry.isFile()) {
        results.push(relative(root, abs).split(sep).join('/'));
      }
    }
  };

  await walk(root);
  return results;
};
