import { ForgewrightError } from '@forgewright/shared';

export interface GoogleAuthFlowOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly scopes?: readonly string[];
  readonly fetchImpl?: typeof fetch;
}

export interface TokenExchange {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresIn: number;
  readonly scope?: string;
}

export interface GoogleProfile {
  readonly email: string;
  readonly name?: string;
}

const DEFAULT_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
];

/**
 * Google OAuth 2.0 Authorization Code flow — the "Connect your Google account"
 * mechanism for multi-tenant use. `buildAuthUrl` starts consent; `exchangeCode`
 * swaps the returned code for tokens (including a long-lived refresh token);
 * `getUserInfo` identifies the user.
 */
export class GoogleAuthFlow {
  private readonly fetchImpl: typeof fetch;
  private readonly scopes: readonly string[];

  constructor(private readonly options: GoogleAuthFlowOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.scopes = options.scopes ?? DEFAULT_SCOPES;
  }

  /** URL to redirect the user to for consent. `state` guards against CSRF. */
  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'offline', // request a refresh token
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<TokenExchange> {
    const body = new URLSearchParams({
      code,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      redirect_uri: this.options.redirectUri,
      grant_type: 'authorization_code',
    });
    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) {
      throw new ForgewrightError(
        'LLM_REQUEST_FAILED',
        `Google code exchange failed (${response.status})`,
      );
    }
    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!data.access_token) {
      throw new ForgewrightError('LLM_REQUEST_FAILED', 'Google token response had no access_token');
    }
    return {
      accessToken: data.access_token,
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      expiresIn: data.expires_in ?? 3600,
      ...(data.scope ? { scope: data.scope } : {}),
    };
  }

  async getUserInfo(accessToken: string): Promise<GoogleProfile> {
    const response = await this.fetchImpl('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new ForgewrightError(
        'LLM_REQUEST_FAILED',
        `Google userinfo failed (${response.status})`,
      );
    }
    const data = (await response.json()) as { email?: string; name?: string };
    if (!data.email) {
      throw new ForgewrightError('LLM_REQUEST_FAILED', 'Google userinfo had no email');
    }
    return { email: data.email, ...(data.name ? { name: data.name } : {}) };
  }

  get scopeList(): readonly string[] {
    return this.scopes;
  }
}
