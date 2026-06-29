import type { Integration, IntegrationCapability, OutgoingMessage, SendResult } from './types.js';

export interface SlackOptions {
  readonly token: string;
  readonly fetchImpl?: typeof fetch;
}

/** Slack Web API integration (chat.postMessage). Requires a bot token. */
export class SlackIntegration implements Integration {
  readonly id = 'slack';
  readonly name = 'Slack';
  readonly kind = 'communication' as const;
  readonly capabilities: readonly IntegrationCapability[] = ['send-message'];

  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: SlackOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sendMessage(message: OutgoingMessage, signal?: AbortSignal): Promise<SendResult> {
    const response = await this.fetchImpl('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${this.options.token}`,
      },
      body: JSON.stringify({ channel: message.target, text: message.text }),
      ...(signal ? { signal } : {}),
    });
    const data = (await response.json()) as { ok: boolean; ts?: string; error?: string };
    return data.ok
      ? { ok: true, id: data.ts ?? '' }
      : { ok: false, error: data.error ?? 'slack postMessage failed' };
  }
}
