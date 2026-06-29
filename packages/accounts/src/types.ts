export interface User {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
  readonly createdAt: number;
}

export interface Session {
  readonly token: string;
  readonly userId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/** A per-user OAuth credential for an external provider (refresh token encrypted). */
export interface StoredCredential {
  readonly userId: string;
  readonly provider: string;
  /** Encrypted via the secret vault — never stored in plaintext. */
  readonly encryptedRefreshToken: string;
  readonly scopes: readonly string[];
  readonly updatedAt: number;
}

/** Persistence for users, sessions, and per-user provider credentials. */
export interface AccountStore {
  upsertUserByEmail(email: string, name?: string): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
  createSession(userId: string, ttlMs: number): Promise<Session>;
  getSession(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<void>;
  saveCredential(credential: StoredCredential): Promise<void>;
  getCredential(userId: string, provider: string): Promise<StoredCredential | undefined>;
}

/** Symmetric encryption for secrets at rest. */
export interface SecretVault {
  encrypt(plaintext: string): string;
  decrypt(token: string): string;
}
