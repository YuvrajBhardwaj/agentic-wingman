import { randomBytes } from 'node:crypto';

import type { AccountStore, SecretVault, User } from '@forgewright/accounts';
import { buildDailyAgenda, type CalendarEvent } from '@forgewright/google';
import type { OAuthProvider } from '@forgewright/oauth';
import type { Logger } from '@forgewright/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** Per-user Google accessor built from that user's refresh token (for the agenda). */
export interface UserGoogle {
  listTodayEvents(): Promise<readonly CalendarEvent[]>;
  unreadCount(): Promise<number>;
}

export interface AuthRouteDeps {
  readonly accountStore: AccountStore;
  readonly vault: SecretVault;
  readonly logger: Logger;
  /** Configured OAuth providers, keyed by id (google, slack, github, …). */
  readonly providers: ReadonlyMap<string, OAuthProvider>;
  readonly buildUserGoogle?: (refreshToken: string) => UserGoogle;
  readonly sessionTtlMs?: number;
  /** If set, the callback redirects here with `#session=<token>` instead of JSON. */
  readonly webRedirectUrl?: string;
}

const SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days
const STATE_TTL = 1000 * 60 * 10;

export const registerAuthRoutes = (app: FastifyInstance, deps: AuthRouteDeps): void => {
  const pendingStates = new Map<string, { provider: string; expiry: number }>();

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

  // Which providers are configured (so the UI shows the right Connect buttons).
  app.get('/auth/providers', async (_request, reply) =>
    reply.send({
      providers: [...deps.providers.values()].map((p) => ({ id: p.id, label: p.label })),
    }),
  );

  // Begin connecting a provider.
  app.get<{ Params: { provider: string } }>('/auth/:provider/start', async (request, reply) => {
    const provider = deps.providers.get(request.params.provider);
    if (!provider) {
      return reply
        .status(501)
        .send({ error: { message: `"${request.params.provider}" is not configured` } });
    }
    const state = randomBytes(16).toString('hex');
    pendingStates.set(state, { provider: provider.id, expiry: Date.now() + STATE_TTL });
    return reply.redirect(provider.buildAuthUrl(state));
  });

  // OAuth callback: exchange code, store the user's encrypted token, issue a session.
  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string } }>(
    '/auth/:provider/callback',
    async (request, reply) => {
      const provider = deps.providers.get(request.params.provider);
      if (!provider)
        return reply.status(501).send({ error: { message: 'provider not configured' } });

      const { code, state } = request.query;
      const pending = state ? pendingStates.get(state) : undefined;
      if (!code || !pending || pending.provider !== provider.id || pending.expiry < Date.now()) {
        return reply.status(400).send({ error: { message: 'invalid or expired state' } });
      }
      pendingStates.delete(state as string);

      const tokens = await provider.exchangeCode(code);
      const info = await provider.getUserInfo(tokens.accessToken);
      const email =
        info.email ??
        `${provider.id}:${info.externalId ?? randomBytes(6).toString('hex')}@forgewright.local`;
      const user = await deps.accountStore.upsertUserByEmail(email, info.name);
      await deps.accountStore.saveCredential({
        userId: user.id,
        provider: provider.id,
        encryptedRefreshToken: deps.vault.encrypt(tokens.refreshToken ?? tokens.accessToken),
        scopes: tokens.scope ? tokens.scope.split(' ') : [...provider.scopes],
        updatedAt: Date.now(),
      });
      const session = await deps.accountStore.createSession(
        user.id,
        deps.sessionTtlMs ?? SESSION_TTL,
      );
      deps.logger.info('user_connected_provider', { userId: user.id, provider: provider.id });

      if (deps.webRedirectUrl) {
        return reply.redirect(`${deps.webRedirectUrl}#session=${session.token}`);
      }
      return reply.send({ token: session.token, user, provider: provider.id });
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
    const connections: Record<string, boolean> = {};
    for (const id of deps.providers.keys()) {
      connections[id] = (await deps.accountStore.getCredential(user.id, id)) !== undefined;
    }
    return reply.send({ user, connections });
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
