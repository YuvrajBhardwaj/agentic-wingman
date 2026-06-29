import { describe, expect, it } from 'vitest';

import { loadConfig, validateConfig } from './config.js';
import { ForgewrightError } from './errors.js';

describe('loadConfig', () => {
  it('produces a valid local-mode config with no env', () => {
    const config = loadConfig({ env: {}, cwd: '/tmp/repo' });
    expect(config.mode).toBe('local');
    expect(config.database.driver).toBe('sqlite');
    expect(config.vector.driver).toBe('hnsw');
    expect(config.embedding.model).toBe('BAAI/bge-small-en-v1.5');
    expect(config.embedding.dimensions).toBe(384);
    expect(config.llm.routes.coding).toBe('default');
  });

  it('switches to scaled drivers in scaled mode', () => {
    const config = loadConfig({ env: { FORGE_MODE: 'scaled' }, cwd: '/tmp/repo' });
    expect(config.database.driver).toBe('postgres');
    expect(config.vector.driver).toBe('qdrant');
  });

  it('honors env overrides', () => {
    const config = loadConfig({
      env: { FORGE_PORT: '9000', FORGE_LLM_MODEL: 'deepseek-coder', FORGE_LLM_API_KEY: 'secret' },
      cwd: '/tmp/repo',
    });
    expect(config.server.port).toBe(9000);
    expect(config.llm.endpoints[0]?.model).toBe('deepseek-coder');
    expect(config.llm.endpoints[0]?.apiKey).toBe('secret');
  });

  it('omits apiKey when not provided', () => {
    const config = loadConfig({ env: {}, cwd: '/tmp/repo' });
    expect(config.llm.endpoints[0]?.apiKey).toBeUndefined();
  });

  it('throws on a non-numeric port', () => {
    expect(() => loadConfig({ env: { FORGE_PORT: 'abc' }, cwd: '/tmp/repo' })).toThrowError(
      ForgewrightError,
    );
  });
});

describe('validateConfig', () => {
  it('rejects routes pointing at unknown endpoints', () => {
    const config = loadConfig({ env: {}, cwd: '/tmp/repo' });
    const broken = {
      ...config,
      llm: { ...config.llm, routes: { ...config.llm.routes, coding: 'missing' } },
    };
    expect(() => validateConfig(broken)).toThrowError(/unknown endpoint/);
  });
});
