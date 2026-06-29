import type {
  Integration,
  IntegrationCapability,
  OutgoingFile,
  OutgoingMessage,
  SendResult,
} from './types.js';

export interface WhatsAppOptions {
  /** WhatsApp Business phone-number id (from Meta). */
  readonly phoneNumberId: string;
  /** Permanent access token. */
  readonly accessToken: string;
  readonly apiVersion?: string;
  readonly fetchImpl?: typeof fetch;
}

/**
 * WhatsApp Business Cloud API integration. Real HTTPS against graph.facebook.com
 * — requires a Meta Business phone-number id and access token. Outbound sends
 * here; inbound messages arrive via the server's webhook route.
 */
export class WhatsAppIntegration implements Integration {
  readonly id = 'whatsapp';
  readonly name = 'WhatsApp';
  readonly kind = 'communication' as const;
  readonly capabilities: readonly IntegrationCapability[] = ['send-message', 'send-file'];

  private readonly fetchImpl: typeof fetch;
  private readonly version: string;

  constructor(private readonly options: WhatsAppOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.version = options.apiVersion ?? 'v20.0';
  }

  private base(): string {
    return `https://graph.facebook.com/${this.version}/${this.options.phoneNumberId}`;
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.options.accessToken}`,
    };
  }

  async sendMessage(message: OutgoingMessage, signal?: AbortSignal): Promise<SendResult> {
    const response = await this.fetchImpl(`${this.base()}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: message.target,
        type: 'text',
        text: { preview_url: false, body: message.text },
      }),
      ...(signal ? { signal } : {}),
    });
    return this.toResult(response);
  }

  async sendFile(file: OutgoingFile, signal?: AbortSignal): Promise<SendResult> {
    // 1) Upload the media, 2) send a document message referencing it.
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([file.bytes]), file.filename);
    const upload = await this.fetchImpl(`${this.base()}/media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.options.accessToken}` },
      body: form,
      ...(signal ? { signal } : {}),
    });
    const media = (await upload.json()) as { id?: string };
    if (!media.id) return { ok: false, error: 'whatsapp media upload failed' };

    const response = await this.fetchImpl(`${this.base()}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: file.target,
        type: 'document',
        document: {
          id: media.id,
          filename: file.filename,
          ...(file.caption ? { caption: file.caption } : {}),
        },
      }),
      ...(signal ? { signal } : {}),
    });
    return this.toResult(response);
  }

  private async toResult(response: Response): Promise<SendResult> {
    if (!response.ok) return { ok: false, error: `whatsapp request failed (${response.status})` };
    const data = (await response.json()) as { messages?: { id: string }[] };
    return { ok: true, id: data.messages?.[0]?.id ?? '' };
  }
}

/** Parse inbound messages from a WhatsApp webhook payload. */
export const parseWhatsAppWebhook = (
  payload: unknown,
): readonly { id: string; from: string; text: string; timestamp: number }[] => {
  const out: { id: string; from: string; text: string; timestamp: number }[] = [];
  const entries = (payload as { entry?: unknown[] }).entry ?? [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] }).changes ?? [];
    for (const change of changes) {
      const messages = (change as { value?: { messages?: unknown[] } }).value?.messages ?? [];
      for (const message of messages) {
        const m = message as {
          id?: string;
          from?: string;
          timestamp?: string;
          text?: { body?: string };
        };
        if (m.id && m.from) {
          out.push({
            id: m.id,
            from: m.from,
            text: m.text?.body ?? '',
            timestamp: m.timestamp ? Number(m.timestamp) * 1000 : 0,
          });
        }
      }
    }
  }
  return out;
};
