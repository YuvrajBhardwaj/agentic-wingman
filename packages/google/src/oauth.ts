import { ForgewrightError } from '@forgewright/shared';

export interface GoogleOAuthOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly fetchImpl?: typeof fetch;
  /** Injected clock for token-expiry tracking; defaults to Date.now. */
  readonly now?: () => number;
}

/**
 * Exchanges a long-lived refresh token for short-lived access tokens against
 * Google's OAuth endpoint, caching until shortly before expiry. The user obtains
 * the refresh token once via a Google OAuth consent flow (with Gmail/Calendar
 * scopes); this class handles the rest.
 */
export class GoogleOAuth {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private accessToken: string | undefined;
  private expiresAt = 0;

  constructor(private readonly options: GoogleOAuthOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      refresh_token: this.options.refreshToken,
      grant_type: 'refresh_token',
    });
    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) {
      throw new ForgewrightError(
        'LLM_REQUEST_FAILED',
        `Google token refresh failed (${response.status})`,
      );
    }
    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new ForgewrightError('LLM_REQUEST_FAILED', 'Google token response had no access_token');
    }
    this.accessToken = data.access_token;
    this.expiresAt = this.now() + (data.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }
}
