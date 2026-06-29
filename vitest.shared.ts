import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Base Vitest config each package extends. Tests discover `*.test.ts` within the
 * package's own `src`; workspace deps resolve via their built `dist` (turbo
 * builds dependencies before running tests).
 */
export const baseTestConfig = defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['src/**/*.{test,spec}.ts'],
  },
});
