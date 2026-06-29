import { describe, expect, it, vi } from 'vitest';

import { createProvider, KNOWN_PROVIDERS } from './presets.js';

const json = (body: unknown, ok = true): Response =>
  new Response(JSON.stringify(body), { status: ok ? 200 : 400 });

const opts = (fetchImpl: typeof fetch) => ({
  clientId: 'CID',
  clientSecret: 'SECRET',
  redirectUri: 'https://app/auth/x/callback',
  fetchImpl,
});

describe('OAuth providers', () => {
  it('exposes the expected provider presets', () => {
    expect(KNOWN_PROVIDERS).toEqual(
      expect.arrayContaining(['google', 'github', 'discord', 'slack', 'microsoft']),
    );
    expect(
      createProvider('nope', opts((async () => json({})) as unknown as typeof fetch)),
    ).toBeUndefined();
  });

  it('builds a Google consent URL requesting offline access', () => {
    const p = createProvider('google', opts((async () => json({})) as unknown as typeof fetch));
    const url = p?.buildAuthUrl('s1') ?? '';
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('state=s1');
    expect(url).toContain('gmail.send');
  });

  it('exchanges a code and reads userinfo (Discord)', async () => {
    const fetchImpl = vi.fn(async (input: string) =>
      input.includes('/token')
        ? json({ access_token: 'AT', refresh_token: 'RT', scope: 'identify email' })
        : json({ id: '42', email: 'u@d.com', global_name: 'User' }),
    ) as unknown as typeof fetch;
    const p = createProvider('discord', opts(fetchImpl));
    const tokens = await p!.exchangeCode('code');
    expect(tokens).toMatchObject({ accessToken: 'AT', refreshToken: 'RT' });
    const info = await p!.getUserInfo('AT');
    expect(info).toEqual({ externalId: '42', email: 'u@d.com', name: 'User' });
  });

  it('sends Accept: application/json for the GitHub token exchange', async () => {
    const fetchImpl = vi.fn(async (input: string, init?: { headers?: Record<string, string> }) => {
      if (input.includes('access_token')) {
        expect(init?.headers?.accept).toBe('application/json');
        return json({ access_token: 'gho_x', scope: 'read:user' });
      }
      return json({ id: 7, login: 'octocat', name: 'The Octocat', email: 'o@gh.com' });
    }) as unknown as typeof fetch;
    const p = createProvider('github', opts(fetchImpl));
    expect((await p!.exchangeCode('c')).accessToken).toBe('gho_x');
    expect(await p!.getUserInfo('gho_x')).toEqual({
      externalId: '7',
      email: 'o@gh.com',
      name: 'The Octocat',
    });
  });

  it('parses Slack OpenID Connect userinfo', async () => {
    const fetchImpl = vi.fn(async (input: string) =>
      input.includes('token')
        ? json({ ok: true, access_token: 'xoxp' })
        : json({ ok: true, sub: 'U123', email: 's@slack.com', name: 'Slacker' }),
    ) as unknown as typeof fetch;
    const p = createProvider('slack', opts(fetchImpl));
    expect((await p!.exchangeCode('c')).accessToken).toBe('xoxp');
    expect(await p!.getUserInfo('xoxp')).toEqual({
      externalId: 'U123',
      email: 's@slack.com',
      name: 'Slacker',
    });
  });

  it('throws on a failed token exchange', async () => {
    const fetchImpl = vi.fn(async () => json({ error: 'bad' }, false)) as unknown as typeof fetch;
    const p = createProvider('microsoft', opts(fetchImpl));
    await expect(p!.exchangeCode('c')).rejects.toThrow(/token exchange failed/);
  });
});
