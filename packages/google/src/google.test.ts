import { describe, expect, it, vi } from 'vitest';

import { buildDailyAgenda } from './agenda.js';
import { CalendarClient } from './calendar.js';
import { GmailClient } from './gmail.js';
import { GoogleOAuth } from './oauth.js';

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

const oauth = (fetchImpl: typeof fetch, now = () => 1000) =>
  new GoogleOAuth({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl, now });

describe('GoogleOAuth', () => {
  it('refreshes and caches the access token', async () => {
    let time = 1000;
    const fetchImpl = vi.fn(async () =>
      json({ access_token: 'AT', expires_in: 3600 }),
    ) as unknown as typeof fetch;
    const auth = oauth(fetchImpl, () => time);
    expect(await auth.getAccessToken()).toBe('AT');
    expect(await auth.getAccessToken()).toBe('AT'); // cached
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    time += 3600_000; // past expiry -> refetch
    await auth.getAccessToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('GmailClient', () => {
  const tokenResponse = () => json({ access_token: 'AT', expires_in: 3600 });

  it('lists and reads messages', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('oauth2')) return tokenResponse();
      if (url.includes('/messages/m1')) {
        return json({
          id: 'm1',
          snippet: 'hello there',
          payload: {
            headers: [
              { name: 'From', value: 'a@b.com' },
              { name: 'Subject', value: 'Hi' },
              { name: 'Date', value: 'Mon, 1 Jan' },
            ],
          },
        });
      }
      return json({ messages: [{ id: 'm1', threadId: 't1' }] });
    }) as unknown as typeof fetch;

    const gmail = new GmailClient(oauth(fetchImpl), fetchImpl);
    const refs = await gmail.listMessages('is:unread');
    expect(refs).toEqual([{ id: 'm1', threadId: 't1' }]);
    const message = await gmail.getMessage('m1');
    expect(message).toMatchObject({ from: 'a@b.com', subject: 'Hi', snippet: 'hello there' });
  });

  it('sends an email with a base64url raw body', async () => {
    let sentBody: string | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.includes('oauth2')) return tokenResponse();
      sentBody = init?.body;
      return json({ id: 'sent-1' });
    }) as unknown as typeof fetch;
    const gmail = new GmailClient(oauth(fetchImpl), fetchImpl);
    const result = await gmail.sendMessage({ to: 'x@y.com', subject: 'Hey', body: 'hello' });
    expect(result.id).toBe('sent-1');
    const raw = JSON.parse(sentBody ?? '{}').raw as string;
    expect(Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).toContain(
      'Subject: Hey',
    );
  });
});

describe('CalendarClient', () => {
  const tokenResponse = () => json({ access_token: 'AT', expires_in: 3600 });

  it('lists events mapping start/end', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('oauth2')) return tokenResponse();
      return json({
        items: [
          {
            id: 'e1',
            summary: 'Standup',
            start: { dateTime: '2026-06-29T09:30:00Z' },
            end: { dateTime: '2026-06-29T10:00:00Z' },
          },
        ],
      });
    }) as unknown as typeof fetch;
    const cal = new CalendarClient(oauth(fetchImpl), fetchImpl);
    const events = await cal.listEvents('2026-06-29T00:00:00Z', '2026-06-29T23:59:59Z');
    expect(events[0]).toMatchObject({
      id: 'e1',
      summary: 'Standup',
      start: '2026-06-29T09:30:00Z',
    });
  });

  it('creates an event', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('oauth2')) return tokenResponse();
      return json({ id: 'new-event' });
    }) as unknown as typeof fetch;
    const cal = new CalendarClient(oauth(fetchImpl), fetchImpl);
    const result = await cal.createEvent({
      summary: 'Focus block',
      start: '2026-06-29T14:00:00Z',
      end: '2026-06-29T15:00:00Z',
    });
    expect(result.id).toBe('new-event');
  });
});

describe('buildDailyAgenda', () => {
  it('summarizes events and unread email count', () => {
    const agenda = buildDailyAgenda(
      [
        { summary: 'Standup', start: '2026-06-29T09:30:00Z', end: '2026-06-29T10:00:00Z' },
        { summary: 'Lunch', start: '2026-06-29T12:00:00Z', end: '2026-06-29T13:00:00Z' },
      ],
      3,
    );
    expect(agenda).toContain('2 event(s) today and 3 unread');
    expect(agenda).toContain('09:30 — Standup');
  });
});
