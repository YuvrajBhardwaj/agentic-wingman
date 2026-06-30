import { defineWorkspace } from 'vitest/config';

/**
 * Run every package/app with its OWN vitest (or vite) config, so per-package
 * settings — notably the web app's jsdom environment + setup files — are
 * honored. This lets `vitest run` at the repo root replace turbo's per-package
 * fan-out, keeping `npm test` and `pnpm test` identical and turbo-free.
 */
export default defineWorkspace(['packages/*', 'apps/*']);
