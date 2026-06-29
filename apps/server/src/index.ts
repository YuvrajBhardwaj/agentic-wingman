import { TOKENS } from '@forgewright/shared';

import { buildApp } from './app.js';
import { buildContainer } from './container.js';

/** Load a local `.env` into process.env if present (Node >= 20.12). */
const loadDotEnv = (): void => {
  const loader = (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile;
  try {
    loader?.();
  } catch {
    // No .env file — rely on the real environment.
  }
};

/** Process entry point: boot the server and wire graceful shutdown. */
const main = async (): Promise<void> => {
  loadDotEnv();
  const container = buildContainer();
  const config = container.resolve(TOKENS.Config);
  const logger = container.resolve(TOKENS.Logger);
  const app = buildApp({ container });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('shutting_down', { signal });
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.server.host, port: config.server.port });
    logger.info('server_listening', {
      host: config.server.host,
      port: config.server.port,
      mode: config.mode,
    });
  } catch (error) {
    logger.error('server_start_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

void main();
