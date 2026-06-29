import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitRepo } from '@forgewright/git';
import { loadConfig } from '@forgewright/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { buildContainer } from '../container.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'fw-git-routes-'));
  const git = new GitRepo({ cwd: root });
  await git.init();
  await writeFile(join(root, 'a.txt'), 'v1', 'utf8');
  await git.commit('init');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const appForRepo = () => {
  const config = loadConfig({ env: {}, cwd: root });
  const container = buildContainer(config);
  // Real GitRepo rooted at the temp repo is provided by the container via config.
  return buildApp({ container });
};

describe('git routes', () => {
  it('reports status and diff for a changed file', async () => {
    await writeFile(join(root, 'a.txt'), 'v2', 'utf8');
    const app = appForRepo();
    try {
      const status = await app.inject({ method: 'GET', url: '/git/status' });
      expect(status.statusCode).toBe(200);
      expect((status.json().files as { path: string }[]).some((f) => f.path === 'a.txt')).toBe(
        true,
      );

      const diff = await app.inject({ method: 'GET', url: '/git/diff' });
      expect(diff.json().diff).toContain('v2');
    } finally {
      await app.close();
    }
  });

  it('commits with a generated message', async () => {
    await writeFile(join(root, 'b.txt'), 'new', 'utf8');
    const app = appForRepo();
    try {
      const res = await app.inject({ method: 'POST', url: '/git/commit', payload: {} });
      expect(res.statusCode).toBe(200);
      expect(res.json().committed).toBe(true);
      expect(res.json().sha).toMatch(/^[0-9a-f]+$/);
    } finally {
      await app.close();
    }
  });

  it('snapshots and rolls back', async () => {
    const app = appForRepo();
    try {
      const snap = await app.inject({ method: 'POST', url: '/git/snapshot', payload: {} });
      const snapshotId = snap.json().snapshotId as string;
      expect(snapshotId).toMatch(/^[0-9a-f]+$/);

      await writeFile(join(root, 'c.txt'), 'created after snapshot', 'utf8');
      const rollback = await app.inject({
        method: 'POST',
        url: '/git/rollback',
        payload: { snapshotId },
      });
      expect(rollback.json().rolledBack).toBe(true);

      const status = await app.inject({ method: 'GET', url: '/git/status' });
      expect((status.json().files as { path: string }[]).some((f) => f.path === 'c.txt')).toBe(
        false,
      );
    } finally {
      await app.close();
    }
  });

  it('400s rollback without a snapshotId', async () => {
    const app = appForRepo();
    try {
      const res = await app.inject({ method: 'POST', url: '/git/rollback', payload: {} });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
