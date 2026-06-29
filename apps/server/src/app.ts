import { InMemoryAccountStore, vaultFromHexKey, type SecretVault } from '@forgewright/accounts';
import { generateKeyHex } from '@forgewright/accounts';
import { createContextBuilder, createIndexer } from '@forgewright/context';
import { CalendarClient, GmailClient, GoogleOAuth } from '@forgewright/google';
import {
  IntegrationManager,
  SlackIntegration,
  TelegramIntegration,
  WebhookIntegration,
  WhatsAppIntegration,
} from '@forgewright/integrations';
import { JobScheduler, WorkflowEngine } from '@forgewright/jobs';
import { McpHost } from '@forgewright/mcp';
import { createProvider, KNOWN_PROVIDERS, type OAuthProvider } from '@forgewright/oauth';
import { TOKENS, type Container } from '@forgewright/shared';
import Fastify, { type FastifyInstance } from 'fastify';

import { ConversationStore } from './agent/conversation-store.js';
import { AgentRunManager } from './agent/run-manager.js';
import { buildContainer } from './container.js';
import { registerAgentRoutes } from './routes/agent.js';
import { registerAuthRoutes, type AuthRouteDeps } from './routes/auth.js';
import { registerAutopilotRoutes } from './routes/autopilot.js';
import { registerGitRoutes } from './routes/git.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerMcpRoutes } from './routes/mcp.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerPlatformRoutes } from './routes/platform.js';
import { registerWebhookRoutes, type InboundMessage } from './routes/webhooks.js';

/** Build the multi-tenant auth dependencies (accounts, vault, Google connect). */
const buildAuthDeps = (logger: AuthRouteDeps['logger']): AuthRouteDeps => {
  const env = process.env;
  let vault: SecretVault;
  if (env.FORGE_SECRET_KEY) {
    vault = vaultFromHexKey(env.FORGE_SECRET_KEY);
  } else {
    vault = vaultFromHexKey(generateKeyHex());
    logger.warn('secret_key_missing', {
      message:
        'FORGE_SECRET_KEY not set — using an ephemeral key; stored credentials will not survive restart',
    });
  }

  const publicUrl = env.FORGE_PUBLIC_URL ?? `http://localhost:${env.FORGE_PORT ?? '4317'}`;

  // Register every provider whose OAuth client id + secret are configured.
  const providers = new Map<string, OAuthProvider>();
  for (const id of KNOWN_PROVIDERS) {
    const clientId = env[`FORGE_${id.toUpperCase()}_CLIENT_ID`];
    const clientSecret = env[`FORGE_${id.toUpperCase()}_CLIENT_SECRET`];
    if (clientId && clientSecret) {
      const provider = createProvider(id, {
        clientId,
        clientSecret,
        redirectUri: `${publicUrl}/auth/${id}/callback`,
      });
      if (provider) providers.set(id, provider);
    }
  }

  const deps: AuthRouteDeps = {
    accountStore: new InMemoryAccountStore(),
    vault,
    logger,
    providers,
    ...(env.FORGE_WEB_URL ? { webRedirectUrl: env.FORGE_WEB_URL } : {}),
  };

  // Google-specific: a per-user agenda built from the connected account.
  const { FORGE_GOOGLE_CLIENT_ID: gid, FORGE_GOOGLE_CLIENT_SECRET: gsecret } = env;
  if (gid && gsecret) {
    const buildUserGoogle: AuthRouteDeps['buildUserGoogle'] = (refreshToken) => {
      const oauth = new GoogleOAuth({ clientId: gid, clientSecret: gsecret, refreshToken });
      const gmail = new GmailClient(oauth);
      const calendar = new CalendarClient(oauth);
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      return {
        listTodayEvents: () => calendar.listEvents(start, end),
        unreadCount: async () => (await gmail.listMessages('is:unread', 50)).length,
      };
    };
    return { ...deps, buildUserGoogle };
  }
  return deps;
};

const buildIntegrations = (): IntegrationManager => {
  const manager = new IntegrationManager();
  const env = process.env;
  if (env.FORGE_TELEGRAM_TOKEN)
    manager.register(new TelegramIntegration({ botToken: env.FORGE_TELEGRAM_TOKEN }));
  if (env.FORGE_SLACK_TOKEN)
    manager.register(new SlackIntegration({ token: env.FORGE_SLACK_TOKEN }));
  if (env.FORGE_WEBHOOK_URL)
    manager.register(new WebhookIntegration({ url: env.FORGE_WEBHOOK_URL }));
  if (env.FORGE_WHATSAPP_PHONE_ID && env.FORGE_WHATSAPP_TOKEN)
    manager.register(
      new WhatsAppIntegration({
        phoneNumberId: env.FORGE_WHATSAPP_PHONE_ID,
        accessToken: env.FORGE_WHATSAPP_TOKEN,
      }),
    );
  return manager;
};

export interface BuildAppOptions {
  readonly container?: Container;
  /** Override the multi-tenant auth dependencies (used in tests). */
  readonly authDeps?: AuthRouteDeps;
}

/**
 * Construct the Fastify application with all routes wired to the DI container.
 * Exported separately from `start` so tests can `inject` without binding a port.
 */
export const buildApp = (options: BuildAppOptions = {}): FastifyInstance => {
  const container = options.container ?? buildContainer();
  const config = container.resolve(TOKENS.Config);
  const logger = container.resolve(TOKENS.Logger);
  const clock = container.resolve(TOKENS.Clock);

  const app = Fastify({ logger: false });
  const startedAt = clock.now();

  app.addHook('onRequest', async (request) => {
    logger.debug('request', { method: request.method, url: request.url });
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    logger.error('request_error', { message: error.message });
    void reply.status(error.statusCode ?? 500).send({
      error: { message: error.message },
    });
  });

  // Index the workspace in the background so retrieval is available without
  // blocking startup. Failures are non-fatal — the agent still runs.
  const indexer = createIndexer(config.workspaceRoot);
  const contextBuilder = createContextBuilder(config.workspaceRoot, indexer);
  void indexer
    .index()
    .then((stats) => logger.info('index_complete', { ...stats }))
    .catch((error: unknown) =>
      logger.warn('index_failed', {
        message: error instanceof Error ? error.message : String(error),
      }),
    );

  const memoryStore = container.resolve(TOKENS.MemoryStore);
  const router = container.resolve(TOKENS.ModelRouter);
  const git = container.resolve(TOKENS.Git);

  // Connect configured MCP servers in the background; their tools become
  // available to agent runs once connected.
  const mcpHost = new McpHost(config.mcpServers, logger);
  if (config.mcpServers.length > 0) {
    void mcpHost.connectAll();
  }
  app.addHook('onClose', async () => {
    await mcpHost.close();
  });

  const integrations = buildIntegrations();

  // Route inbound messages (WhatsApp webhook / Telegram poll) to the workflow
  // engine so users can automate "when I receive X → do Y".
  const workflow = new WorkflowEngine(logger);
  const onInbound = (channel: string, messages: readonly InboundMessage[]): void => {
    for (const message of messages) {
      logger.info('inbound_message', { channel, from: message.from });
      void workflow.trigger(`${channel}:message`, message).catch(() => undefined);
    }
  };

  // Background Telegram poller (only when configured) for continuous receiving.
  if (integrations.get('telegram')) {
    const scheduler = new JobScheduler({ logger, now: () => clock.now() });
    scheduler.register({
      id: 'telegram-poll',
      name: 'Telegram inbound',
      intervalMs: 4000,
      run: async () => {
        const messages = await integrations.sync('telegram');
        onInbound('telegram', messages);
        return { changed: messages.length > 0, summary: `${messages.length} new` };
      },
    });
    scheduler.start();
    app.addHook('onClose', async () => scheduler.stop());
  }

  registerHealthRoutes(app, { config, startedAt, now: () => clock.now() });
  registerAgentRoutes(app, {
    config,
    logger,
    router,
    runManager: new AgentRunManager(),
    conversationStore: new ConversationStore(),
    contextBuilder,
    memoryStore,
    mcpHost,
  });
  registerMemoryRoutes(app, { memoryStore });
  registerGitRoutes(app, { git });
  registerMcpRoutes(app, { mcpHost });
  registerAuthRoutes(app, options.authDeps ?? buildAuthDeps(logger));
  registerWebhookRoutes(app, {
    logger,
    onInbound,
    ...(process.env.FORGE_WHATSAPP_VERIFY_TOKEN
      ? { whatsappVerifyToken: process.env.FORGE_WHATSAPP_VERIFY_TOKEN }
      : {}),
  });
  registerPlatformRoutes(app, { router, memoryStore, integrations });
  registerAutopilotRoutes(app, {
    config,
    logger,
    router,
    git,
    planner: container.resolve(TOKENS.Planner),
    contextBuilder,
    memoryStore,
    mcpHost,
  });

  return app;
};
