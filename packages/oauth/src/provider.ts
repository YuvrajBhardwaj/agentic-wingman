import { ForgewrightError } from '@forgewright/shared';

import type { OAuth2Spec, OAuthProvider, OAuthTokens, OAuthUserInfo } from './types.js';

export interface OAuthProviderOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly scopes?: readonly string[];
  readonly fetchImpl?: typeof fetch;
}

const defaultParseToken = (data: unknown): OAuthTokens => {
  const d = data as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
  };
  if (!d.access_token) {
    throw new ForgewrightError('LLM_REQUEST_FAILED', 'OAuth token response had no access_token');
  }
  return {
    accessToken: d.access_token,
    ...(d.refresh_token ? { refreshToken: d.refresh_token } : {}),
    ...(d.scope ? { scope: d.scope } : {}),
    ...(d.expires_in ? { expiresIn: d.expires_in } : {}),
  };
};

/**
 * Standard OAuth 2.0 Authorization Code provider, configured by an {@link OAuth2Spec}.
 * One implementation drives Google, Slack, Discord, GitHub, Microsoft, etc.
 */
export class GenericOAuthProvider implements OAuthProvider {
  readonly id: string;
  readonly label: string;
  readonly scopes: readonly string[];
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly spec: OAuth2Spec,
    private readonly options: OAuthProviderOptions,
  ) {
    this.id = spec.id;
    this.label = spec.label;
    this.scopes = options.scopes ?? spec.defaultScopes;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state,
      ...this.spec.authParams,
    });
    return `${this.spec.authUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
    if (this.spec.tokenAcceptJson) headers.accept = 'application/json';
    const body = new URLSearchParams({
      code,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      redirect_uri: this.options.redirectUri,
      grant_type: 'authorization_code',
    });
    const response = await this.fetchImpl(this.spec.tokenUrl, {
      method: 'POST',
      headers,
      body: body.toString(),
    });
    if (!response.ok) {
      throw new ForgewrightError(
        'LLM_REQUEST_FAILED',
        `${this.label} token exchange failed (${response.status})`,
      );
    }
    const data = (await response.json()) as unknown;
    return (this.spec.parseToken ?? defaultParseToken)(data);
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const response = await this.fetchImpl(this.spec.userInfoUrl, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        'user-agent': 'Forgewright',
      },
    });
    if (!response.ok) {
      throw new ForgewrightError(
        'LLM_REQUEST_FAILED',
        `${this.label} userinfo failed (${response.status})`,
      );
    }
    return this.spec.parseUserInfo((await response.json()) as unknown);
  }
}
