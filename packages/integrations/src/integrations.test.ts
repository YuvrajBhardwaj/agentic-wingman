import { describe, expect, it, vi } from 'vitest';

import { IntegrationManager } from './manager.js';
import { SlackIntegration } from './slack.js';
import { TelegramIntegration } from './telegram.js';
import type { Integration } from './types.js';
import { WebhookIntegration } from './webhook.js';
import { parseWhatsAppWebhook, WhatsAppIntegration } from './whatsapp.js';

const jsonResponse = (body: unknown, ok = true): Response =>
  new Response(JSON.stringify(body), { status: ok ? 200 : 500 });

describe('TelegramIntegration', () => {
  it('sends a message via the Bot API', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, result: { message_id: 42 } }),
    ) as unknown as typeof fetch;
    const tg = new TelegramIntegration({ botToken: 'T', fetchImpl });
    const result = await tg.sendMessage({ target: '123', text: 'hi' });
    expect(result).toEqual({ ok: true, id: '42' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.telegram.org/botT/sendMessage',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reads updates and advances the offset', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: true,
        result: [
          {
            update_id: 10,
            message: { message_id: 1, date: 5, text: 'hello', from: { username: 'bob' } },
          },
        ],
      }),
    ) as unknown as typeof fetch;
    const tg = new TelegramIntegration({ botToken: 'T', fetchImpl });
    const messages = await tg.readMessages(10);
    expect(messages[0]).toMatchObject({ from: 'bob', text: 'hello', timestamp: 5000 });
    await tg.readMessages(10);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      expect.stringContaining('offset=11'),
      expect.anything(),
    );
  });
});

describe('SlackIntegration', () => {
  it('posts a message with a bearer token', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, ts: '1.2' }),
    ) as unknown as typeof fetch;
    const slack = new SlackIntegration({ token: 'xoxb', fetchImpl });
    const result = await slack.sendMessage({ target: '#general', text: 'hi' });
    expect(result).toEqual({ ok: true, id: '1.2' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer xoxb' }),
      }),
    );
  });
});

describe('WebhookIntegration', () => {
  it('posts the message to the configured URL', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;
    const hook = new WebhookIntegration({ url: 'https://hooks.example/x', fetchImpl });
    const result = await hook.sendMessage({ target: 'room', text: 'ping' });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://hooks.example/x',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('WhatsAppIntegration', () => {
  it('sends a text message via the Cloud API', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ messages: [{ id: 'wamid.123' }] }),
    ) as unknown as typeof fetch;
    const wa = new WhatsAppIntegration({ phoneNumberId: '999', accessToken: 'TOK', fetchImpl });
    const result = await wa.sendMessage({ target: '15551234567', text: 'hi' });
    expect(result).toEqual({ ok: true, id: 'wamid.123' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://graph.facebook.com/v20.0/999/messages',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer TOK' }),
      }),
    );
  });

  it('uploads media then sends a document', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return url.endsWith('/media')
        ? jsonResponse({ id: 'media-1' })
        : jsonResponse({ messages: [{ id: 'wamid.doc' }] });
    }) as unknown as typeof fetch;
    const wa = new WhatsAppIntegration({ phoneNumberId: '999', accessToken: 'TOK', fetchImpl });
    const result = await wa.sendFile({
      target: '15551234567',
      filename: 'r.pdf',
      bytes: Buffer.from('x'),
    });
    expect(result).toEqual({ ok: true, id: 'wamid.doc' });
    expect(calls).toEqual([
      'https://graph.facebook.com/v20.0/999/media',
      'https://graph.facebook.com/v20.0/999/messages',
    ]);
  });

  it('parses inbound messages from a webhook payload', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: 'wamid.in', from: '15559999999', timestamp: '5', text: { body: 'hello' } },
                ],
              },
            },
          ],
        },
      ],
    };
    const messages = parseWhatsAppWebhook(payload);
    expect(messages).toEqual([
      { id: 'wamid.in', from: '15559999999', text: 'hello', timestamp: 5000 },
    ]);
  });
});

describe('IntegrationManager', () => {
  const fakeIntegration = (
    sendMessage = vi.fn(async () => ({ ok: true, id: '1' })),
  ): Integration => ({
    id: 'fake',
    name: 'Fake',
    kind: 'communication',
    capabilities: ['send-message', 'read-messages'],
    sendMessage,
    readMessages: async (limit) =>
      [
        { id: 'a', from: 'x', text: 'one', timestamp: 1 },
        { id: 'b', from: 'x', text: 'two', timestamp: 2 },
      ].slice(0, limit),
  });

  it('gates outgoing messages through the approval callback', async () => {
    const send = vi.fn(async () => ({ ok: true, id: '1' }));
    const denied = new IntegrationManager(async () => false);
    denied.register(fakeIntegration(send));
    expect((await denied.sendMessage('fake', { target: 't', text: 'x' })).ok).toBe(false);
    expect(send).not.toHaveBeenCalled();

    const allowed = new IntegrationManager(async () => true);
    allowed.register(fakeIntegration(send));
    expect((await allowed.sendMessage('fake', { target: 't', text: 'x' })).ok).toBe(true);
    expect(send).toHaveBeenCalled();
  });

  it('deduplicates messages across syncs', async () => {
    const manager = new IntegrationManager();
    manager.register(fakeIntegration());
    const first = await manager.sync('fake');
    expect(first.map((m) => m.id)).toEqual(['a', 'b']);
    const second = await manager.sync('fake');
    expect(second).toHaveLength(0); // already seen
  });

  it('lists registered integrations', () => {
    const manager = new IntegrationManager();
    manager.register(fakeIntegration());
    expect(manager.list()[0]).toMatchObject({
      id: 'fake',
      capabilities: ['send-message', 'read-messages'],
    });
  });
});
