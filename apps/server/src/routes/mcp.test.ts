import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '@forgewright/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { buildContainer } from '../container.js';

const here = dirname(fileURLToPath(import.meta.url));
const echoServer = join(
  here,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'mcp',
  'fixtures',
  'echo-server.mjs',
);

const mcpEnv = {
  FORGE_MCP_SERVERS: JSON.stringify([
    { name: 'echo', command: 'node', args: [echoServer], trust: 'allow' },
  ]),
};

let app: ReturnType<typeof buildApp> | undefined;
afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

/** Poll until the MCP server reports connected (background connect). */
const waitForConnected = async (instance: ReturnType<typeof buildApp>): Promise<unknown> => {
  for (let i = 0; i < 50; i += 1) {
    const res = await instance.inject({ method: 'GET', url: '/mcp/servers' });
    const servers = res.json().servers as { name: string; connected: boolean; tools: string[] }[];
    if (servers[0]?.connected) return servers[0];
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('MCP server did not connect in time');
};

describe('mcp routes', () => {
  it('lists configured MCP servers and their tools once connected', async () => {
    app = buildApp({ container: buildContainer(loadConfig({ env: mcpEnv, cwd: process.cwd() })) });
    const server = (await waitForConnected(app)) as { name: string; tools: string[] };
    expect(server.name).toBe('echo');
    expect(server.tools).toContain('mcp__echo__echo');
  });

  it('hot-reloads a server', async () => {
    app = buildApp({ container: buildContainer(loadConfig({ env: mcpEnv, cwd: process.cwd() })) });
    await waitForConnected(app);
    const res = await app.inject({ method: 'POST', url: '/mcp/servers/echo/reload' });
    expect(res.statusCode).toBe(200);
    expect(res.json().reloaded).toBe(true);
  });

  it('404s an unknown server reload', async () => {
    app = buildApp({ container: buildContainer(loadConfig({ env: {}, cwd: process.cwd() })) });
    const res = await app.inject({ method: 'POST', url: '/mcp/servers/ghost/reload' });
    expect(res.statusCode).toBe(404);
  });
});
