import { randomBytes } from 'node:crypto';

import type { AccountStore, SecretVault, User } from '@forgewright/accounts';
import { buildDailyAgenda, type CalendarEvent } from '@forgewright/google';
import type { Logger } from '@forgewright/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** Minimal surface of the Google consent flow the routes depend on. */
export interface GoogleAuthFlowLike {
  buildAuthUrl(state: string): string;
  exchangeCode(
    code: string,
  ): Promise<{ accessToken: string; refreshToken?: string; scope?: string }>;
  getUserInfo(accessToken: string): Promise<{ email: string; name?: string }>;
  readonly scopeList: readonly string[];
}

/** Per-user Google accessor built from that user's refresh token. */
export interface UserGoogle {
  listTodayEvents(): Promise<readonly CalendarEvent[]>;
  unreadCount(): Promise<number>;
}

export interface AuthRouteDeps {
  readonly accountStore: AccountStore;
  readonly vault: SecretVault;
  readonly logger: Logger;
  readonly googleAuthFlow?: GoogleAuthFlowLike;
  readonly buildUserGoogle?: (refreshToken: string) => UserGoogle;
  readonly sessionTtlMs?: number;
  /** If set, the callback redirects here with `#session=<token>` instead of JSON. */
  readonly webRedirectUrl?: string;
}

const SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

export const registerAuthRoutes = (app: FastifyInstance, deps: AuthRouteDeps): void => {
  // CSRF state for in-flight consent redirects (short-lived).
  const pendingStates = new Map<string, number>();
  const STATE_TTL = 1000 * 60 * 10;

  const requireUser = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<User | undefined> => {
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const session = token ? await deps.accountStore.getSession(token) : undefined;
    const user = session ? await deps.accountStore.getUser(session.userId) : undefined;
    if (!user) {
      await reply.status(401).send({ error: { message: 'authentication required' } });
      return undefined;
    }
    return user;
  };

  // Begin "Connect with Google".
  app.get('/auth/google/start', async (_request, reply) => {
    if (!deps.googleAuthFlow) {
      return reply
        .status(501)
        .send({ error: { message: 'Google is not configured on this server' } });
    }
    const state = randomBytes(16).toString('hex');
    pendingStates.set(state, Date.now() + STATE_TTL);
    return reply.redirect(deps.googleAuthFlow.buildAuthUrl(state));
  });

  // OAuth callback: exchange code, store the user's encrypted refresh token, issue a session.
  app.get<{ Querystring: { code?: string; state?: string } }>(
    '/auth/google/callback',
    async (request, reply) => {
      const flow = deps.googleAuthFlow;
      if (!flow) return reply.status(501).send({ error: { message: 'Google is not configured' } });
      const { code, state } = request.query;
      if (
        !code ||
        !state ||
        !pendingStates.has(state) ||
        (pendingStates.get(state) ?? 0) < Date.now()
      ) {
        return reply.status(400).send({ error: { message: 'invalid or expired state' } });
      }
      pendingStates.delete(state);

      const tokens = await flow.exchangeCode(code);
      if (!tokens.refreshToken) {
        return reply.status(400).send({
          error: { message: 'no refresh token returned; re-consent with offline access' },
        });
      }
      const profile = await flow.getUserInfo(tokens.accessToken);
      const user = await deps.accountStore.upsertUserByEmail(profile.email, profile.name);
      await deps.accountStore.saveCredential({
        userId: user.id,
        provider: 'google',
        encryptedRefreshToken: deps.vault.encrypt(tokens.refreshToken),
        scopes: tokens.scope ? tokens.scope.split(' ') : [...flow.scopeList],
        updatedAt: Date.now(),
      });
      const session = await deps.accountStore.createSession(
        user.id,
        deps.sessionTtlMs ?? SESSION_TTL,
      );
      deps.logger.info('user_connected_google', { userId: user.id });

      if (deps.webRedirectUrl) {
        return reply.redirect(`${deps.webRedirectUrl}#session=${session.token}`);
      }
      return reply.send({ token: session.token, user });
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    const header = request.headers.authorization ?? '';
    if (header.startsWith('Bearer ')) await deps.accountStore.deleteSession(header.slice(7));
    return reply.send({ ok: true });
  });

  // Current user + which providers they've connected.
  app.get('/me', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return reply;
    const google = await deps.accountStore.getCredential(user.id, 'google');
    return reply.send({ user, connections: { google: google !== undefined } });
  });

  // Per-user daily agenda from the user's own Google data.
  app.get('/me/google/agenda', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return reply;
    const credential = await deps.accountStore.getCredential(user.id, 'google');
    if (!credential || !deps.buildUserGoogle) {
      return reply
        .status(409)
        .send({ error: { message: 'Google is not connected for this user' } });
    }
    const google = deps.buildUserGoogle(deps.vault.decrypt(credential.encryptedRefreshToken));
    const [events, unread] = await Promise.all([google.listTodayEvents(), google.unreadCount()]);
    return reply.send({ agenda: buildDailyAgenda(events, unread), events, unread });
  });
};
