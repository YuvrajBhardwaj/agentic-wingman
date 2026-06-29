import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.FORGE_API_URL ?? 'http://127.0.0.1:4317';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    // Proxy API calls to the Forgewright server so the browser stays same-origin
    // (no CORS needed in dev). '/agent' covers '/agents'; '/me' covers '/memory'.
    proxy: Object.fromEntries(
      [
        '/health',
        '/agent',
        '/memory',
        '/pkb',
        '/documents',
        '/integrations',
        '/git',
        '/mcp',
        '/auth',
        '/me',
      ].map((path) => [path, { target: API_TARGET, changeOrigin: true }]),
    ),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
