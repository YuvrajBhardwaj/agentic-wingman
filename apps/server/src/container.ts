import { GitRepo } from '@forgewright/git';
import { createModelRouter } from '@forgewright/llm';
import { createKnowledgeGraph, createMemoryStore } from '@forgewright/memory';
import { LlmPlanner } from '@forgewright/planner';
import {
  Container,
  loadConfig,
  StructuredLogger,
  SystemClock,
  TOKENS,
  type Clock,
} from '@forgewright/shared';
import type {
  ForgewrightConfig,
  GitService,
  KnowledgeGraph,
  Logger,
  MemoryStore,
  ModelRouter,
  Planner,
} from '@forgewright/types';

/**
 * Compose the application's dependency container. Cross-cutting services are
 * registered here; feature services are added as later phases land.
 */
export const buildContainer = (config: ForgewrightConfig = loadConfig()): Container => {
  const container = new Container();

  container.registerValue(TOKENS.Config, config);
  container.register<Clock>(TOKENS.Clock, () => new SystemClock());
  container.register<Logger>(
    TOKENS.Logger,
    (c) =>
      new StructuredLogger({
        level: c.resolve(TOKENS.Config).logLevel,
        clock: c.resolve(TOKENS.Clock),
      }),
  );
  container.register<ModelRouter>(TOKENS.ModelRouter, (c) =>
    createModelRouter(c.resolve(TOKENS.Config).llm),
  );
  container.register<MemoryStore>(TOKENS.MemoryStore, (c) => {
    const cfg = c.resolve(TOKENS.Config);
    return createMemoryStore({ embedding: cfg.embedding, vector: cfg.vector });
  });
  container.register<KnowledgeGraph>(TOKENS.KnowledgeGraph, () => createKnowledgeGraph());
  container.register<GitService>(
    TOKENS.Git,
    (c) => new GitRepo({ cwd: c.resolve(TOKENS.Config).workspaceRoot }),
  );
  container.register<Planner>(
    TOKENS.Planner,
    (c) => new LlmPlanner({ router: c.resolve(TOKENS.ModelRouter) }),
  );

  return container;
};
