import { DocumentRegistry, summarizeDocument } from '@forgewright/documents';
import type { IntegrationManager } from '@forgewright/integrations';
import { HybridSearch } from '@forgewright/jobs';
import { AgentCoordinator } from '@forgewright/orchestrator';
import type { MemoryStore, ModelRouter } from '@forgewright/types';
import type { FastifyInstance } from 'fastify';

export interface PlatformRouteDeps {
  readonly router: ModelRouter;
  readonly memoryStore: MemoryStore;
  readonly integrations: IntegrationManager;
}

const documents = new DocumentRegistry();

export const registerPlatformRoutes = (app: FastifyInstance, deps: PlatformRouteDeps): void => {
  const coordinator = new AgentCoordinator(deps.router);
  const pkb = new HybridSearch(deps.memoryStore);

  // ---- Multi-agent collaboration ----
  app.get('/agents/roles', async (_req, reply) =>
    reply.send({ roles: coordinator.availableRoles() }),
  );

  app.post<{ Body: { goal?: unknown; agents?: unknown; mode?: unknown } }>(
    '/agents/collaborate',
    async (request, reply) => {
      const { goal, agents, mode } = request.body ?? {};
      if (typeof goal !== 'string' || goal.trim() === '') {
        return reply.status(400).send({ error: { message: '"goal" (string) is required' } });
      }
      const team =
        Array.isArray(agents) && agents.every((a) => typeof a === 'string') && agents.length > 0
          ? (agents as string[])
          : ['planner', 'software-engineer', 'reviewer'];
      const result = await coordinator.collaborate(goal, team, {
        mode: mode === 'sequential' ? 'sequential' : 'parallel',
      });
      return reply.send(result);
    },
  );

  // ---- Personal knowledge base: hybrid search ----
  app.get<{ Querystring: { q?: string; limit?: string } }>(
    '/pkb/search',
    async (request, reply) => {
      const q = request.query.q;
      if (!q || q.trim() === '')
        return reply.status(400).send({ error: { message: 'query "q" is required' } });
      const limit = request.query.limit ? Number(request.query.limit) : 10;
      const results = await pkb.search(q, { limit: Number.isFinite(limit) ? limit : 10 });
      return reply.send({ results });
    },
  );

  // ---- Documents ----
  app.post<{ Body: { filename?: unknown; base64?: unknown; summarize?: unknown } }>(
    '/documents/parse',
    async (request, reply) => {
      const { filename, base64, summarize } = request.body ?? {};
      if (typeof filename !== 'string' || typeof base64 !== 'string') {
        return reply
          .status(400)
          .send({ error: { message: '"filename" and "base64" are required' } });
      }
      try {
        const parsed = await documents.parse({ filename, bytes: Buffer.from(base64, 'base64') });
        const summary =
          summarize === true ? await summarizeDocument(parsed, deps.router) : undefined;
        return reply.send({ document: parsed, ...(summary !== undefined ? { summary } : {}) });
      } catch (error) {
        return reply
          .status(415)
          .send({ error: { message: error instanceof Error ? error.message : String(error) } });
      }
    },
  );

  app.get('/documents/formats', async (_req, reply) =>
    reply.send({ extensions: documents.supportedExtensions() }),
  );

  // ---- Integrations ----
  app.get('/integrations', async (_req, reply) =>
    reply.send({ integrations: deps.integrations.list() }),
  );

  app.post<{ Params: { id: string }; Body: { target?: unknown; text?: unknown } }>(
    '/integrations/:id/send',
    async (request, reply) => {
      const { target, text } = request.body ?? {};
      if (typeof target !== 'string' || typeof text !== 'string') {
        return reply.status(400).send({ error: { message: '"target" and "text" are required' } });
      }
      try {
        const result = await deps.integrations.sendMessage(request.params.id, { target, text });
        return reply.status(result.ok ? 200 : 502).send(result);
      } catch (error) {
        return reply
          .status(404)
          .send({ error: { message: error instanceof Error ? error.message : String(error) } });
      }
    },
  );
};
