import type {
  ForgewrightConfig,
  GitService,
  KnowledgeGraph,
  Logger,
  MemoryStore,
  ModelRouter,
  Planner,
} from '@forgewright/types';

import type { Clock } from './clock.js';
import { createToken } from './container.js';

/** Canonical DI tokens for cross-cutting services. */
export const TOKENS = {
  Config: createToken<ForgewrightConfig>('ForgewrightConfig'),
  Logger: createToken<Logger>('Logger'),
  Clock: createToken<Clock>('Clock'),
  ModelRouter: createToken<ModelRouter>('ModelRouter'),
  MemoryStore: createToken<MemoryStore>('MemoryStore'),
  KnowledgeGraph: createToken<KnowledgeGraph>('KnowledgeGraph'),
  Git: createToken<GitService>('GitService'),
  Planner: createToken<Planner>('Planner'),
} as const;
