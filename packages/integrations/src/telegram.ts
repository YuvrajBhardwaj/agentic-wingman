import type {
  IncomingMessage,
  Integration,
  IntegrationCapability,
  OutgoingFile,
  OutgoingMessage,
  SendResult,
} from './types.js';

export interface TelegramOptions {
  readonly botToken: string;
  readonly fetchImpl?: typeof fetch;
}

interface TgUpdate {
  readonly update_id: number;
  readonly message?: {
    readonly message_id: number;
    readonly date: number;
    readonly text?: string;
    readonly from?: { readonly username?: string; readonly id?: number };
  };
}

/**
 * Telegram Bot API integration. Real HTTP against api.telegram.org — requires a
 * bot token. Supports sending messages/files and polling updates.
 */
export class TelegramIntegration implements Integration {
  readonly id = 'telegram';
  readonly name = 'Telegram';
  readonly kind = 'communication' as const;
  readonly capabilities: readonly IntegrationCapability[] = [
    'send-message',
    'send-file',
    'read-messages',
  ];

  private readonly fetchImpl: typeof fetch;
  private offset = 0;

  constructor(private readonly options: TelegramOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private url(method: string): string {
    return `https://api.telegram.org/bot${this.options.botToken}/${method}`;
  }

  async sendMessage(message: OutgoingMessage, signal?: AbortSignal): Promise<SendResult> {
    const response = await this.fetchImpl(this.url('sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: message.target, text: message.text }),
      ...(signal ? { signal } : {}),
    });
    const data = (await response.json()) as { ok: boolean; result?: { message_id: number } };
    return data.ok
      ? { ok: true, id: String(data.result?.message_id ?? '') }
      : { ok: false, error: 'telegram sendMessage failed' };
  }

  async sendFile(file: OutgoingFile, signal?: AbortSignal): Promise<SendResult> {
    const form = new FormData();
    form.append('chat_id', file.target);
    if (file.caption) form.append('caption', file.caption);
    form.append('document', new Blob([file.bytes]), file.filename);
    const response = await this.fetchImpl(this.url('sendDocument'), {
      method: 'POST',
      body: form,
      ...(signal ? { signal } : {}),
    });
    const data = (await response.json()) as { ok: boolean; result?: { message_id: number } };
    return data.ok
      ? { ok: true, id: String(data.result?.message_id ?? '') }
      : { ok: false, error: 'telegram sendDocument failed' };
  }

  async readMessages(limit: number, signal?: AbortSignal): Promise<readonly IncomingMessage[]> {
    const response = await this.fetchImpl(
      `${this.url('getUpdates')}?offset=${this.offset}&limit=${limit}`,
      signal ? { signal } : {},
    );
    const data = (await response.json()) as { ok: boolean; result?: TgUpdate[] };
    const updates = data.result ?? [];
    const messages: IncomingMessage[] = [];
    for (const update of updates) {
      this.offset = Math.max(this.offset, update.update_id + 1);
      if (update.message?.text) {
        messages.push({
          id: String(update.message.message_id),
          from: update.message.from?.username ?? String(update.message.from?.id ?? 'unknown'),
          text: update.message.text,
          timestamp: update.message.date * 1000,
        });
      }
    }
    return messages;
  }
}
