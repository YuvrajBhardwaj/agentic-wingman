import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

/**
 * Load the nearest `.env` into process.env if present (Node >= 20.12). Walks up
 * from `startDir` so `forge` picks up the project's `.env` no matter how deep in
 * the tree it is invoked from.
 */
export const loadDotEnv = (startDir: string = process.cwd()): string | undefined => {
  const loader = (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile;
  if (!loader) return undefined;
  let dir = startDir;
  const { root } = parse(dir);
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      try {
        loader(candidate);
        return candidate;
      } catch {
        return undefined; // Malformed .env — rely on the real environment.
      }
    }
    if (dir === root) return undefined;
    dir = dirname(dir);
  }
};
