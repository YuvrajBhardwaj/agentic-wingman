import type { GoogleOAuth } from './oauth.js';

export interface GmailMessageRef {
  readonly id: string;
  readonly threadId: string;
}

export interface GmailMessage {
  readonly id: string;
  readonly from: string;
  readonly subject: string;
  readonly snippet: string;
  readonly date: string;
}

export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

const base64Url = (text: string): string =>
  Buffer.from(text, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

interface GmailHeader {
  readonly name: string;
  readonly value: string;
}

/** Gmail API client. Reads/searches mail and sends messages. */
export class GmailClient {
  constructor(
    private readonly oauth: GoogleOAuth,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async authHeader(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await this.oauth.getAccessToken()}` };
  }

  /** Search messages with a Gmail query (e.g. "is:unread newer_than:1d"). */
  async listMessages(query: string, maxResults = 10): Promise<readonly GmailMessageRef[]> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    const response = await this.fetchImpl(url, { headers: await this.authHeader() });
    const data = (await response.json()) as { messages?: GmailMessageRef[] };
    return data.messages ?? [];
  }

  async getMessage(id: string): Promise<GmailMessage> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
    const response = await this.fetchImpl(url, { headers: await this.authHeader() });
    const data = (await response.json()) as {
      id: string;
      snippet?: string;
      payload?: { headers?: GmailHeader[] };
    };
    const headers = data.payload?.headers ?? [];
    const header = (name: string): string =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
    return {
      id: data.id,
      from: header('From'),
      subject: header('Subject'),
      snippet: data.snippet ?? '',
      date: header('Date'),
    };
  }

  async sendMessage(email: OutgoingEmail): Promise<{ id: string }> {
    const mime = [
      `To: ${email.to}`,
      `Subject: ${email.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      email.body,
    ].join('\r\n');
    const response = await this.fetchImpl(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: { ...(await this.authHeader()), 'content-type': 'application/json' },
        body: JSON.stringify({ raw: base64Url(mime) }),
      },
    );
    const data = (await response.json()) as { id?: string };
    return { id: data.id ?? '' };
  }
}
