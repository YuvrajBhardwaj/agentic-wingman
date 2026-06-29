import type { ModelRole } from '@forgewright/types';
import { describe, expect, it } from 'vitest';

import { FakeLlmProvider } from './fake-provider.js';
import { DefaultModelRouter } from './router.js';

const routes: Record<ModelRole, string> = {
  cheap: 'a',
  coding: 'b',
  reasoning: 'b',
  verification: 'missing',
};

describe('DefaultModelRouter', () => {
  it('routes roles to their configured provider', () => {
    const a = new FakeLlmProvider([], 'a');
    const b = new FakeLlmProvider([], 'b');
    const router = new DefaultModelRouter([a, b], routes);
    expect(router.forRole('cheap')).toBe(a);
    expect(router.forRole('coding')).toBe(b);
  });

  it('falls back to the first provider for an unknown route', () => {
    const a = new FakeLlmProvider([], 'a');
    const b = new FakeLlmProvider([], 'b');
    const router = new DefaultModelRouter([a, b], routes);
    expect(router.forRole('verification')).toBe(a);
  });

  it('exposes providers by id and as a list', () => {
    const a = new FakeLlmProvider([], 'a');
    const router = new DefaultModelRouter([a], { ...routes, coding: 'a' });
    expect(router.get('a')).toBe(a);
    expect(router.get('nope')).toBeUndefined();
    expect(router.list()).toHaveLength(1);
  });

  it('throws when constructed with no providers', () => {
    expect(() => new DefaultModelRouter([], routes)).toThrowError(/at least one provider/);
  });
});
