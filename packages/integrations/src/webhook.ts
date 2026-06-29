import type { Integration, IntegrationCapability, OutgoingMessage, SendResult } from './types.js';

export interface WebhookOptions {
  readonly id?: string;
  readonly name?: string;
  readonly url: string;
  readonly fetchImpl?: typeof fetch;
}

/** Generic outgoing webhook integration: POSTs messages as JSON to a URL. */
export class WebhookIntegration implements Integration {
  readonly id: string;
  readonly name: string;
  readonly kind = 'webhook' as const;
  readonly capabilities: readonly IntegrationCapability[] = ['send-message'];

  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: WebhookOptions) {
    this.id = options.id ?? 'webhook';
    this.name = options.name ?? 'Webhook';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sendMessage(message: OutgoingMessage, signal?: AbortSignal): Promise<SendResult> {
    const response = await this.fetchImpl(this.options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: message.target, text: message.text }),
      ...(signal ? { signal } : {}),
    });
    return response.ok ? { ok: true } : { ok: false, error: `webhook failed (${response.status})` };
  }
}
