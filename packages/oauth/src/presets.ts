import { GenericOAuthProvider, type OAuthProviderOptions } from './provider.js';
import type { OAuth2Spec, OAuthProvider, OAuthTokens, OAuthUserInfo } from './types.js';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** Built-in provider specs. Each follows OAuth 2.0 with provider-specific quirks. */
export const PROVIDER_SPECS: Readonly<Record<string, OAuth2Spec>> = {
  google: {
    id: 'google',
    label: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    defaultScopes: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    authParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    parseUserInfo: (data): OAuthUserInfo => {
      const d = data as { email?: string; name?: string };
      return { ...(d.email ? { email: d.email } : {}), ...(d.name ? { name: d.name } : {}) };
    },
  },

  github: {
    id: 'github',
    label: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    defaultScopes: ['read:user', 'user:email'],
    tokenAcceptJson: true,
    parseUserInfo: (data): OAuthUserInfo => {
      const d = data as { id?: number; login?: string; name?: string; email?: string };
      return {
        ...(d.id !== undefined ? { externalId: String(d.id) } : {}),
        ...(str(d.email) ? { email: d.email as string } : {}),
        ...((str(d.name) ?? str(d.login)) ? { name: (str(d.name) ?? str(d.login)) as string } : {}),
      };
    },
  },

  discord: {
    id: 'discord',
    label: 'Discord',
    authUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userInfoUrl: 'https://discord.com/api/users/@me',
    defaultScopes: ['identify', 'email'],
    parseUserInfo: (data): OAuthUserInfo => {
      const d = data as { id?: string; email?: string; global_name?: string; username?: string };
      return {
        ...(str(d.id) ? { externalId: d.id as string } : {}),
        ...(str(d.email) ? { email: d.email as string } : {}),
        ...((str(d.global_name) ?? str(d.username))
          ? { name: (str(d.global_name) ?? str(d.username)) as string }
          : {}),
      };
    },
  },

  slack: {
    id: 'slack',
    label: 'Slack',
    authUrl: 'https://slack.com/openid/connect/authorize',
    tokenUrl: 'https://slack.com/api/openid.connect.token',
    userInfoUrl: 'https://slack.com/api/openid.connect.userInfo',
    defaultScopes: ['openid', 'email', 'profile'],
    parseToken: (data): OAuthTokens => {
      const d = data as { access_token?: string; refresh_token?: string };
      if (!d.access_token) throw new Error('Slack token response had no access_token');
      return {
        accessToken: d.access_token,
        ...(d.refresh_token ? { refreshToken: d.refresh_token } : {}),
      };
    },
    parseUserInfo: (data): OAuthUserInfo => {
      const d = data as { sub?: string; email?: string; name?: string };
      return {
        ...(str(d.sub) ? { externalId: d.sub as string } : {}),
        ...(str(d.email) ? { email: d.email as string } : {}),
        ...(str(d.name) ? { name: d.name as string } : {}),
      };
    },
  },

  microsoft: {
    id: 'microsoft',
    label: 'Microsoft',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    defaultScopes: ['openid', 'email', 'profile', 'offline_access', 'User.Read', 'Mail.Read'],
    parseUserInfo: (data): OAuthUserInfo => {
      const d = data as {
        id?: string;
        mail?: string;
        userPrincipalName?: string;
        displayName?: string;
      };
      return {
        ...(str(d.id) ? { externalId: d.id as string } : {}),
        ...((str(d.mail) ?? str(d.userPrincipalName))
          ? { email: (str(d.mail) ?? str(d.userPrincipalName)) as string }
          : {}),
        ...(str(d.displayName) ? { name: d.displayName as string } : {}),
      };
    },
  },
};

export const KNOWN_PROVIDERS = Object.keys(PROVIDER_SPECS);

/** Build a provider by id, or undefined if the id is unknown. */
export const createProvider = (
  id: string,
  options: OAuthProviderOptions,
): OAuthProvider | undefined => {
  const spec = PROVIDER_SPECS[id];
  return spec ? new GenericOAuthProvider(spec, options) : undefined;
};
