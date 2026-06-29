import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { env } from 'node:process';

import type {
  LlmEndpointConfig,
  McpServerConfig,
  ModelRole,
  ForgewrightConfig,
} from '@forgewright/types';

import { ForgewrightError } from './errors.js';

const DEFAULT_DIMENSIONS = 384; // bge-small-en-v1.5

const parseMcpServers = (value: string | undefined): readonly McpServerConfig[] => {
  if (!value || value.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ForgewrightError('CONFIG_INVALID', 'FORGE_MCP_SERVERS must be valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new ForgewrightError('CONFIG_INVALID', 'FORGE_MCP_SERVERS must be a JSON array');
  }
  return parsed.map((entry, i) => {
    const e = entry as Partial<McpServerConfig>;
    if (typeof e.name !== 'string' || typeof e.command !== 'string') {
      throw new ForgewrightError('CONFIG_INVALID', `MCP server [${i}] needs "name" and "command"`);
    }
    return {
      name: e.name,
      command: e.command,
      ...(Array.isArray(e.args) ? { args: e.args } : {}),
      ...(e.env ? { env: e.env } : {}),
      ...(e.trust ? { trust: e.trust } : {}),
    };
  });
};

export interface ConfigOverrides {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
}

const num = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ForgewrightError('CONFIG_INVALID', `Expected a number, got "${value}"`);
  }
  return parsed;
};

/**
 * Build the runtime config from defaults overlaid with environment variables.
 * Local mode (SQLite + in-process HNSW + local embeddings) needs zero config.
 */
export const loadConfig = (overrides: ConfigOverrides = {}): ForgewrightConfig => {
  const e = overrides.env ?? env;
  const workspaceRoot = resolve(overrides.cwd ?? e.FORGE_WORKSPACE ?? process.cwd());
  const dataDir = e.FORGE_DATA_DIR ?? join(homedir(), '.forgewright');
  const mode = (e.FORGE_MODE as ForgewrightConfig['mode']) ?? 'local';

  const defaultEndpoint: LlmEndpointConfig = {
    id: 'default',
    kind: (e.FORGE_LLM_KIND as LlmEndpointConfig['kind']) ?? 'openai-compatible',
    baseUrl: e.FORGE_LLM_BASE_URL ?? 'http://localhost:11434/v1',
    model: e.FORGE_LLM_MODEL ?? 'qwen2.5-coder',
    ...(e.FORGE_LLM_API_KEY ? { apiKey: e.FORGE_LLM_API_KEY } : {}),
  };

  const routes: Record<ModelRole, string> = {
    cheap: e.FORGE_ROUTE_CHEAP ?? defaultEndpoint.id,
    coding: e.FORGE_ROUTE_CODING ?? defaultEndpoint.id,
    reasoning: e.FORGE_ROUTE_REASONING ?? defaultEndpoint.id,
    verification: e.FORGE_ROUTE_VERIFICATION ?? defaultEndpoint.id,
  };

  const config: ForgewrightConfig = {
    mode,
    workspaceRoot,
    dataDir,
    logLevel: (e.FORGE_LOG_LEVEL as ForgewrightConfig['logLevel']) ?? 'info',
    server: {
      host: e.FORGE_HOST ?? '127.0.0.1',
      port: num(e.FORGE_PORT, 4317),
    },
    database: {
      driver: mode === 'scaled' ? 'postgres' : 'sqlite',
      url: e.FORGE_DB_URL ?? join(dataDir, 'wingman.sqlite'),
    },
    vector: {
      driver: mode === 'scaled' ? 'qdrant' : 'hnsw',
      ...(e.FORGE_VECTOR_URL ? { url: e.FORGE_VECTOR_URL } : {}),
    },
    embedding: {
      provider: (e.FORGE_EMBED_PROVIDER as ForgewrightConfig['embedding']['provider']) ?? 'local',
      model: e.FORGE_EMBED_MODEL ?? 'BAAI/bge-small-en-v1.5',
      dimensions: num(e.FORGE_EMBED_DIMS, DEFAULT_DIMENSIONS),
    },
    llm: {
      endpoints: [defaultEndpoint],
      routes,
    },
    ...(e.FORGE_VERIFY_CMD ? { verifyCommand: e.FORGE_VERIFY_CMD } : {}),
    mcpServers: parseMcpServers(e.FORGE_MCP_SERVERS),
  };

  validateConfig(config);
  return config;
};

export const validateConfig = (config: ForgewrightConfig): void => {
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new ForgewrightError('CONFIG_INVALID', `Invalid port: ${config.server.port}`);
  }
  if (config.embedding.dimensions < 1) {
    throw new ForgewrightError('CONFIG_INVALID', 'Embedding dimensions must be positive');
  }
  const endpointIds = new Set(config.llm.endpoints.map((ep) => ep.id));
  for (const [role, id] of Object.entries(config.llm.routes)) {
    if (!endpointIds.has(id)) {
      throw new ForgewrightError(
        'CONFIG_INVALID',
        `Route "${role}" references unknown endpoint "${id}"`,
      );
    }
  }
};
