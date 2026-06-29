import { loadConfig } from '@forgewright/shared';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { buildContainer } from './container.js';

const config = loadConfig({ env: {}, cwd: process.cwd() });

describe('server app', () => {
  it('responds ok on /health', async () => {
    const app = buildApp({ container: buildContainer(config) });
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body.mode).toBe('local');
      expect(typeof body.uptimeMs).toBe('number');
      expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
    } finally {
      await app.close();
    }
  });

  it('returns 404 for unknown routes', async () => {
    const app = buildApp({ container: buildContainer(config) });
    try {
      const res = await app.inject({ method: 'GET', url: '/nope' });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
