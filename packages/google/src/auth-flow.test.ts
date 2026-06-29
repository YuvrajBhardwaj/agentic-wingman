import { describe, expect, it, vi } from 'vitest';

import { GoogleAuthFlow } from './auth-flow.js';

const json = (body: unknown, ok = true): Response =>
  new Response(JSON.stringify(body), { status: ok ? 200 : 400 });

const flow = (fetchImpl: typeof fetch) =>
  new GoogleAuthFlow({
    clientId: 'CID',
    clientSecret: 'SECRET',
    redirectUri: 'https://app.example/auth/google/callback',
    fetchImpl,
  });

describe('GoogleAuthFlow', () => {
  it('builds a consent URL requesting offline access and a refresh token', () => {
    const url = flow((async () => json({})) as unknown as typeof fetch).buildAuthUrl('state123');
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=CID');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('state=state123');
    expect(url).toContain('gmail.send');
    expect(url).toContain('calendar.events');
  });

  it('exchanges an authorization code for tokens', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, scope: 'email' }),
    ) as unknown as typeof fetch;
    const result = await flow(fetchImpl).exchangeCode('the-code');
    expect(result).toMatchObject({ accessToken: 'AT', refreshToken: 'RT', expiresIn: 3600 });
  });

  it('fetches the user profile', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ email: 'user@example.com', name: 'User' }),
    ) as unknown as typeof fetch;
    const profile = await flow(fetchImpl).getUserInfo('AT');
    expect(profile).toEqual({ email: 'user@example.com', name: 'User' });
  });

  it('throws when the code exchange fails', async () => {
    const fetchImpl = vi.fn(async () => json({ error: 'bad' }, false)) as unknown as typeof fetch;
    await expect(flow(fetchImpl).exchangeCode('x')).rejects.toThrow(/code exchange failed/);
  });
});
