import { loadConfig } from '@forgewright/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { buildContainer } from '../container.js';

let app: ReturnType<typeof buildApp> | undefined;

const makeApp = (env: Record<string, string> = {}) => {
  // Webhook verification reads process.env at request time.
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  app = buildApp({ container: buildContainer(loadConfig({ env: {}, cwd: process.cwd() })) });
  return app;
};

afterEach(async () => {
  delete process.env.FORGE_WHATSAPP_VERIFY_TOKEN;
  if (app) await app.close();
  app = undefined;
});

describe('WhatsApp webhook', () => {
  it('echoes the challenge when the verify token matches', async () => {
    const res = await makeApp({ FORGE_WHATSAPP_VERIFY_TOKEN: 'secret' }).inject({
      method: 'GET',
      url: '/integrations/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=secret&hub.challenge=12345',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('12345');
  });

  it('rejects a bad verify token', async () => {
    const res = await makeApp({ FORGE_WHATSAPP_VERIFY_TOKEN: 'secret' }).inject({
      method: 'GET',
      url: '/integrations/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345',
    });
    expect(res.statusCode).toBe(403);
  });

  it('accepts inbound messages', async () => {
    const res = await makeApp().inject({
      method: 'POST',
      url: '/integrations/webhooks/whatsapp',
      payload: {
        entry: [
          {
            changes: [
              {
                value: { messages: [{ id: 'wamid.1', from: '15550001111', text: { body: 'hi' } }] },
              },
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(1);
  });
});
