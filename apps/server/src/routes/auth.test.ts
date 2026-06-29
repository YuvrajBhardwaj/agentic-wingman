import { InMemoryAccountStore, vaultFromHexKey, generateKeyHex } from '@forgewright/accounts';
import { MemorySink, StructuredLogger } from '@forgewright/shared';
import { loadConfig } from '@forgewright/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { buildContainer } from '../container.js';

import type { AuthRouteDeps, GoogleAuthFlowLike, UserGoogle } from './auth.js';

const logger = new StructuredLogger({ sink: new MemorySink() });

const fakeFlow: GoogleAuthFlowLike = {
  buildAuthUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  exchangeCode: async () => ({
    accessToken: 'AT',
    refreshToken: 'user-refresh-token',
    scope: 'email calendar',
  }),
  getUserInfo: async () => ({ email: 'alice@example.com', name: 'Alice' }),
  scopeList: ['email'],
};

const fakeUserGoogle = (refreshToken: string): UserGoogle => ({
  listTodayEvents: async () =>
    refreshToken === 'user-refresh-token'
      ? [
          {
            id: 'e1',
            summary: 'Standup',
            start: '2026-06-29T09:30:00Z',
            end: '2026-06-29T10:00:00Z',
          },
        ]
      : [],
  unreadCount: async () => 2,
});

let app: ReturnType<typeof buildApp> | undefined;

const makeApp = (overrides: Partial<AuthRouteDeps> = {}) => {
  const authDeps: AuthRouteDeps = {
    accountStore: new InMemoryAccountStore(),
    vault: vaultFromHexKey(generateKeyHex()),
    logger,
    googleAuthFlow: fakeFlow,
    buildUserGoogle: fakeUserGoogle,
    ...overrides,
  };
  app = buildApp({
    container: buildContainer(loadConfig({ env: {}, cwd: process.cwd() })),
    authDeps,
  });
  return app;
};

/** Drive the OAuth connect loop and return the issued session token. */
const connect = async (
  instance: ReturnType<typeof buildApp>,
): Promise<{ token: string; user: { id: string } }> => {
  const start = await instance.inject({ method: 'GET', url: '/auth/google/start' });
  expect(start.statusCode).toBe(302);
  const state = new URL(start.headers.location as string).searchParams.get('state');
  const callback = await instance.inject({
    method: 'GET',
    url: `/auth/google/callback?code=abc&state=${state}`,
  });
  expect(callback.statusCode).toBe(200);
  return callback.json();
};

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

describe('multi-tenant Google auth', () => {
  it('connects a user via the OAuth flow and issues a session', async () => {
    const application = makeApp();
    const { token, user } = await connect(application);
    expect(token).toBeTruthy();
    expect(user.id).toBeTruthy();

    const me = await application.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('alice@example.com');
    expect(me.json().connections.google).toBe(true);
  });

  it('serves a per-user agenda from the connected account', async () => {
    const application = makeApp();
    const { token } = await connect(application);
    const res = await application.inject({
      method: 'GET',
      url: '/me/google/agenda',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().agenda).toContain('1 event(s) today and 2 unread');
    expect(res.json().agenda).toContain('Standup');
  });

  it('rejects unauthenticated access to /me', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a callback with a bad state (CSRF guard)', async () => {
    const res = await makeApp().inject({
      method: 'GET',
      url: '/auth/google/callback?code=abc&state=forged',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 501 when Google is not configured', async () => {
    const res = await makeApp({ googleAuthFlow: undefined as never }).inject({
      method: 'GET',
      url: '/auth/google/start',
    });
    expect(res.statusCode).toBe(501);
  });
});
