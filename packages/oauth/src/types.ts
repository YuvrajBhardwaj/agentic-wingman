export interface OAuthTokens {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly scope?: string;
  readonly expiresIn?: number;
}

export interface OAuthUserInfo {
  /** Provider-native id (used when the provider doesn't expose an email). */
  readonly externalId?: string;
  readonly email?: string;
  readonly name?: string;
}

/** A configured OAuth 2.0 provider the user can connect from the UI. */
export interface OAuthProvider {
  readonly id: string;
  readonly label: string;
  /** Scopes this provider was configured with. */
  readonly scopes: readonly string[];
  buildAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

/** Declarative description of a provider's OAuth 2.0 endpoints and quirks. */
export interface OAuth2Spec {
  readonly id: string;
  readonly label: string;
  readonly authUrl: string;
  readonly tokenUrl: string;
  readonly userInfoUrl: string;
  readonly defaultScopes: readonly string[];
  /** Extra params on the authorize URL (e.g. Google's access_type=offline). */
  readonly authParams?: Readonly<Record<string, string>>;
  /** Send `Accept: application/json` on the token request (GitHub needs this). */
  readonly tokenAcceptJson?: boolean;
  readonly parseToken?: (data: unknown) => OAuthTokens;
  readonly parseUserInfo: (data: unknown) => OAuthUserInfo;
}
