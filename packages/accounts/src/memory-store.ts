import { randomBytes, randomUUID } from 'node:crypto';

import type { AccountStore, Session, StoredCredential, User } from './types.js';

export interface InMemoryAccountStoreOptions {
  readonly now?: () => number;
  readonly generateId?: () => string;
  readonly generateToken?: () => string;
}

/**
 * In-memory account store. Suitable for single-process/dev; swap for a
 * SQLite/Postgres-backed implementation behind the same {@link AccountStore}
 * interface for durable multi-tenant deployments.
 */
export class InMemoryAccountStore implements AccountStore {
  private readonly users = new Map<string, User>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly sessions = new Map<string, Session>();
  private readonly credentials = new Map<string, StoredCredential>();
  private readonly now: () => number;
  private readonly generateId: () => string;
  private readonly generateToken: () => string;

  constructor(options: InMemoryAccountStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.generateId = options.generateId ?? (() => randomUUID());
    this.generateToken = options.generateToken ?? (() => randomBytes(32).toString('hex'));
  }

  async upsertUserByEmail(email: string, name?: string): Promise<User> {
    const key = email.toLowerCase();
    const existingId = this.usersByEmail.get(key);
    if (existingId) {
      const existing = this.users.get(existingId);
      if (existing) return existing;
    }
    const user: User = {
      id: this.generateId(),
      email,
      ...(name ? { name } : {}),
      createdAt: this.now(),
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(key, user.id);
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async createSession(userId: string, ttlMs: number): Promise<Session> {
    const createdAt = this.now();
    const session: Session = {
      token: this.generateToken(),
      userId,
      createdAt,
      expiresAt: createdAt + ttlMs,
    };
    this.sessions.set(session.token, session);
    return session;
  }

  async getSession(token: string): Promise<Session | undefined> {
    const session = this.sessions.get(token);
    if (!session) return undefined;
    if (this.now() >= session.expiresAt) {
      this.sessions.delete(token);
      return undefined;
    }
    return session;
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async saveCredential(credential: StoredCredential): Promise<void> {
    this.credentials.set(`${credential.userId}:${credential.provider}`, credential);
  }

  async getCredential(userId: string, provider: string): Promise<StoredCredential | undefined> {
    return this.credentials.get(`${userId}:${provider}`);
  }
}
