import type { MemoryKind, MemoryStore } from '@forgewright/types';
import type { FastifyInstance } from 'fastify';

export interface MemoryRouteDeps {
  readonly memoryStore: MemoryStore;
}

const VALID_KINDS: ReadonlySet<string> = new Set<MemoryKind>([
  'preference',
  'decision',
  'recurring-bug',
  'todo',
  'conversation',
  'summary',
]);

interface RememberBody {
  readonly kind?: unknown;
  readonly content?: unknown;
  readonly tags?: unknown;
  readonly importance?: unknown;
}

export const registerMemoryRoutes = (app: FastifyInstance, deps: MemoryRouteDeps): void => {
  // Store a memory.
  app.post('/memory', async (request, reply) => {
    const body = (request.body ?? {}) as RememberBody;
    if (typeof body.content !== 'string' || body.content.trim() === '') {
      return reply.status(400).send({ error: { message: '"content" (string) is required' } });
    }
    const kind =
      typeof body.kind === 'string' && VALID_KINDS.has(body.kind)
        ? (body.kind as MemoryKind)
        : 'summary';
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === 'string')
      : [];
    const importance = typeof body.importance === 'number' ? body.importance : 1;

    const memory = await deps.memoryStore.remember({
      kind,
      content: body.content,
      tags,
      importance,
    });
    return reply.status(201).send(memory);
  });

  // Semantic search over memories.
  app.get<{ Querystring: { q?: string; limit?: string; kind?: string } }>(
    '/memory/search',
    async (request, reply) => {
      const q = request.query.q;
      if (!q || q.trim() === '') {
        return reply.status(400).send({ error: { message: 'query "q" is required' } });
      }
      const limit = request.query.limit ? Number(request.query.limit) : 5;
      const kind = request.query.kind;
      const results = await deps.memoryStore.retrieve({
        query: q,
        limit: Number.isFinite(limit) ? limit : 5,
        ...(kind && VALID_KINDS.has(kind) ? { kinds: [kind as MemoryKind] } : {}),
      });
      return reply.send({ results });
    },
  );

  // List all memories.
  app.get('/memory', async (_request, reply) => {
    return reply.send({ memories: await deps.memoryStore.all() });
  });

  // Forget a memory.
  app.delete<{ Params: { id: string } }>('/memory/:id', async (request, reply) => {
    await deps.memoryStore.forget(request.params.id);
    return reply.status(204).send();
  });
};
