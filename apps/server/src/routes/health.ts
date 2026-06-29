import type { ForgewrightConfig } from '@forgewright/types';
import type { FastifyInstance } from 'fastify';

export interface HealthDeps {
  readonly config: ForgewrightConfig;
  readonly startedAt: number;
  readonly now: () => number;
}

/** Liveness/readiness endpoint plus minimal build/runtime info. */
export const registerHealthRoutes = (app: FastifyInstance, deps: HealthDeps): void => {
  app.get('/health', async () => ({
    status: 'ok' as const,
    mode: deps.config.mode,
    version: '0.0.1',
    uptimeMs: deps.now() - deps.startedAt,
  }));
};
