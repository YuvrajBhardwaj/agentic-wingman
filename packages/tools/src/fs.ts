import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import { ForgewrightError } from '@forgewright/shared';
import type { ToolFs } from '@forgewright/types';

/**
 * Filesystem access confined to a root directory. Any attempt to read or write
 * outside the root is rejected — tools cannot escape the workspace sandbox.
 */
export class SandboxedFs implements ToolFs {
  constructor(private readonly root: string) {
    this.root = resolve(root);
  }

  /** Resolve a possibly-relative path and assert it stays within the sandbox. */
  resolve(path: string): string {
    const absolute = isAbsolute(path) ? resolve(path) : resolve(this.root, path);
    const rel = relative(this.root, absolute);
    if (rel === '') return absolute;
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new ForgewrightError('PERMISSION_DENIED', `Path escapes workspace sandbox: ${path}`, {
        path,
        root: this.root,
      });
    }
    return absolute;
  }

  async readFile(path: string): Promise<string> {
    return readFile(this.resolve(path), 'utf8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    const target = this.resolve(path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await stat(this.resolve(path));
      return true;
    } catch {
      return false;
    }
  }

  async list(path: string): Promise<readonly string[]> {
    const entries = await readdir(this.resolve(path), { withFileTypes: true });
    return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  }
}
