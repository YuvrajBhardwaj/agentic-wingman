import type { GitService } from '@forgewright/types';
import type { FastifyInstance } from 'fastify';

export interface GitRouteDeps {
  readonly git: GitService;
}

const ensureRepo = async (git: GitService): Promise<boolean> => git.isRepo();

export const registerGitRoutes = (app: FastifyInstance, deps: GitRouteDeps): void => {
  app.get('/git/status', async (_request, reply) => {
    if (!(await ensureRepo(deps.git))) {
      return reply.status(409).send({ error: { message: 'workspace is not a git repository' } });
    }
    return reply.send({
      branch: await deps.git.currentBranch(),
      files: await deps.git.status(),
    });
  });

  app.get<{ Querystring: { staged?: string } }>('/git/diff', async (request, reply) => {
    if (!(await ensureRepo(deps.git))) {
      return reply.status(409).send({ error: { message: 'workspace is not a git repository' } });
    }
    const diff = await deps.git.diff({ staged: request.query.staged === 'true' });
    return reply.send({ diff });
  });

  app.post<{ Body: { message?: string } }>('/git/commit', async (request, reply) => {
    if (!(await ensureRepo(deps.git))) {
      return reply.status(409).send({ error: { message: 'workspace is not a git repository' } });
    }
    const message =
      typeof request.body?.message === 'string' && request.body.message.trim() !== ''
        ? request.body.message
        : await deps.git.summarizeChanges();
    const sha = await deps.git.commit(message);
    return reply.send({ committed: sha !== undefined, sha: sha ?? null, message });
  });

  app.post('/git/snapshot', async (_request, reply) => {
    if (!(await ensureRepo(deps.git))) {
      return reply.status(409).send({ error: { message: 'workspace is not a git repository' } });
    }
    return reply.send({ snapshotId: await deps.git.snapshot() });
  });

  app.post<{ Body: { snapshotId?: string } }>('/git/rollback', async (request, reply) => {
    if (typeof request.body?.snapshotId !== 'string') {
      return reply.status(400).send({ error: { message: '"snapshotId" is required' } });
    }
    if (!(await ensureRepo(deps.git))) {
      return reply.status(409).send({ error: { message: 'workspace is not a git repository' } });
    }
    await deps.git.rollback(request.body.snapshotId);
    return reply.send({ rolledBack: true });
  });
};
