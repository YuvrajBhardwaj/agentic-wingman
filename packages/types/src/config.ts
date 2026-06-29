export type RuntimeMode = 'local' | 'scaled';

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
}

export interface DatabaseConfig {
  /** `sqlite` for local mode, `postgres` for scaled mode. */
  readonly driver: 'sqlite' | 'postgres';
  /** SQLite file path or Postgres connection string. */
  readonly url: string;
}

export interface VectorConfig {
  /** In-process HNSW for local mode, Qdrant for scaled mode. */
  readonly driver: 'hnsw' | 'qdrant';
  readonly url?: string;
}

export interface EmbeddingConfig {
  readonly provider: 'local' | 'ollama' | 'openai';
  readonly model: string;
  readonly dimensions: number;
}

export interface LlmEndpointConfig {
  readonly id: string;
  readonly kind: 'openai-compatible' | 'ollama';
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly model: string;
}

export type ModelRole = 'cheap' | 'coding' | 'reasoning' | 'verification';

export interface LlmConfig {
  readonly endpoints: readonly LlmEndpointConfig[];
  /** Maps each routing role to an endpoint id. */
  readonly routes: Readonly<Record<ModelRole, string>>;
}

export interface McpServerConfig {
  readonly name: string;
  /** Executable to spawn for a stdio MCP server. */
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  /** Default permission decision for this server's tools. */
  readonly trust?: 'allow' | 'prompt' | 'deny';
}

export interface ForgewrightConfig {
  readonly mode: RuntimeMode;
  readonly workspaceRoot: string;
  /** Directory for Forgewright-local state (db, indexes, caches). */
  readonly dataDir: string;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  readonly server: ServerConfig;
  readonly database: DatabaseConfig;
  readonly vector: VectorConfig;
  readonly embedding: EmbeddingConfig;
  readonly llm: LlmConfig;
  /** Shell command the autopilot runs to verify changes (tests/lint/build). */
  readonly verifyCommand?: string;
  /** External MCP servers to connect and expose tools from. */
  readonly mcpServers: readonly McpServerConfig[];
  /** Token budget for injected workspace context (lower for rate-limited models). */
  readonly contextTokenBudget?: number;
  /** Cap on output tokens per agent turn. */
  readonly agentMaxTokens?: number;
}
