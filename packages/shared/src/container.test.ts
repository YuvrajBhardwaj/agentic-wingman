import { describe, expect, it } from 'vitest';

import { Container, createToken } from './container.js';
import { ForgewrightError } from './errors.js';

interface Service {
  value: number;
}

const ServiceToken = createToken<Service>('Service');
const DepToken = createToken<number>('Dep');

describe('Container', () => {
  it('resolves a registered factory', () => {
    const c = new Container();
    c.register(ServiceToken, () => ({ value: 42 }));
    expect(c.resolve(ServiceToken).value).toBe(42);
  });

  it('caches singletons', () => {
    const c = new Container();
    let calls = 0;
    c.register(ServiceToken, () => ({ value: ++calls }));
    const a = c.resolve(ServiceToken);
    const b = c.resolve(ServiceToken);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });

  it('creates a new instance each resolve when not a singleton', () => {
    const c = new Container();
    let calls = 0;
    c.register(ServiceToken, () => ({ value: ++calls }), { singleton: false });
    expect(c.resolve(ServiceToken)).not.toBe(c.resolve(ServiceToken));
    expect(calls).toBe(2);
  });

  it('injects dependencies via the container argument', () => {
    const c = new Container();
    c.registerValue(DepToken, 7);
    c.register(ServiceToken, (container) => ({ value: container.resolve(DepToken) * 2 }));
    expect(c.resolve(ServiceToken).value).toBe(14);
  });

  it('throws for unregistered tokens', () => {
    const c = new Container();
    expect(() => c.resolve(ServiceToken)).toThrowError(ForgewrightError);
  });

  it('detects circular dependencies', () => {
    const c = new Container();
    const a = createToken<number>('A');
    const b = createToken<number>('B');
    c.register(a, (container) => container.resolve(b));
    c.register(b, (container) => container.resolve(a));
    expect(() => c.resolve(a)).toThrowError(/Circular dependency/);
  });

  it('child scopes inherit registrations but isolate singletons', () => {
    const c = new Container();
    c.register(ServiceToken, () => ({ value: 1 }));
    const parentInstance = c.resolve(ServiceToken);
    const scope = c.createScope();
    const childInstance = scope.resolve(ServiceToken);
    expect(childInstance).not.toBe(parentInstance);
    expect(childInstance.value).toBe(1);
  });
});
