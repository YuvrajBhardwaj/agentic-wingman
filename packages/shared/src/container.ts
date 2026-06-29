import { ForgewrightError } from './errors.js';

/** A typed dependency token. The phantom `_type` carries the resolved type. */
export interface Token<T> {
  readonly description: string;
  readonly _type?: T;
}

export const createToken = <T>(description: string): Token<T> => ({ description });

type Factory<T> = (container: Container) => T;

interface Registration<T> {
  readonly factory: Factory<T>;
  readonly singleton: boolean;
}

/**
 * Minimal, typed dependency-injection container.
 * - `register` binds a factory (singleton by default).
 * - `resolve` lazily constructs and caches singletons.
 * - Detects circular dependencies during resolution.
 */
export class Container {
  private readonly registrations = new Map<Token<unknown>, Registration<unknown>>();
  private readonly instances = new Map<Token<unknown>, unknown>();
  private readonly resolving = new Set<Token<unknown>>();

  register<T>(token: Token<T>, factory: Factory<T>, options: { singleton?: boolean } = {}): this {
    this.registrations.set(token as Token<unknown>, {
      factory: factory as Factory<unknown>,
      singleton: options.singleton ?? true,
    });
    return this;
  }

  /** Register an already-constructed value as a singleton. */
  registerValue<T>(token: Token<T>, value: T): this {
    this.registrations.set(token as Token<unknown>, {
      factory: () => value,
      singleton: true,
    });
    this.instances.set(token as Token<unknown>, value);
    return this;
  }

  has(token: Token<unknown>): boolean {
    return this.registrations.has(token);
  }

  resolve<T>(token: Token<T>): T {
    const key = token as Token<unknown>;
    if (this.instances.has(key)) {
      return this.instances.get(key) as T;
    }

    const registration = this.registrations.get(key);
    if (!registration) {
      throw new ForgewrightError(
        'DEPENDENCY_NOT_REGISTERED',
        `No registration for dependency "${token.description}"`,
        { token: token.description },
      );
    }

    if (this.resolving.has(key)) {
      throw new ForgewrightError(
        'INTERNAL',
        `Circular dependency detected while resolving "${token.description}"`,
        { token: token.description },
      );
    }

    this.resolving.add(key);
    try {
      const value = registration.factory(this) as T;
      if (registration.singleton) {
        this.instances.set(key, value);
      }
      return value;
    } finally {
      this.resolving.delete(key);
    }
  }

  /** Create a child scope that inherits registrations but has its own singletons. */
  createScope(): Container {
    const child = new Container();
    for (const [token, registration] of this.registrations) {
      child.registrations.set(token, registration);
    }
    return child;
  }
}
