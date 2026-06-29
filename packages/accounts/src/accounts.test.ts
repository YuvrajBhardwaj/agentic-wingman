import { describe, expect, it } from 'vitest';

import { InMemoryAccountStore } from './memory-store.js';
import { AesGcmVault, generateKeyHex, vaultFromHexKey } from './vault.js';

describe('AesGcmVault', () => {
  it('round-trips a secret', () => {
    const vault = vaultFromHexKey(generateKeyHex());
    const token = vault.encrypt('refresh-token-123');
    expect(token).not.toContain('refresh-token-123'); // not plaintext
    expect(vault.decrypt(token)).toBe('refresh-token-123');
  });

  it('fails to decrypt with a different key', () => {
    const a = vaultFromHexKey(generateKeyHex());
    const b = vaultFromHexKey(generateKeyHex());
    expect(() => b.decrypt(a.encrypt('secret'))).toThrow();
  });

  it('rejects a wrong-length key', () => {
    expect(() => new AesGcmVault(Buffer.alloc(16))).toThrow(/32 bytes/);
  });
});

describe('InMemoryAccountStore', () => {
  const makeStore = () => {
    let counter = 0;
    let time = 1000;
    return {
      store: new InMemoryAccountStore({
        now: () => time,
        generateId: () => `u${(counter += 1)}`,
        generateToken: () => `t${counter}`,
      }),
      advance: (ms: number) => {
        time += ms;
      },
    };
  };

  it('upserts a user idempotently by email', async () => {
    const { store } = makeStore();
    const a = await store.upsertUserByEmail('Alice@Example.com', 'Alice');
    const b = await store.upsertUserByEmail('alice@example.com');
    expect(a.id).toBe(b.id); // case-insensitive, same user
    expect((await store.getUser(a.id))?.email).toBe('Alice@Example.com');
  });

  it('creates and expires sessions', async () => {
    const { store, advance } = makeStore();
    const user = await store.upsertUserByEmail('x@y.com');
    const session = await store.createSession(user.id, 1000);
    expect((await store.getSession(session.token))?.userId).toBe(user.id);
    advance(1001);
    expect(await store.getSession(session.token)).toBeUndefined(); // expired
  });

  it('stores and retrieves per-user provider credentials', async () => {
    const { store } = makeStore();
    const user = await store.upsertUserByEmail('x@y.com');
    await store.saveCredential({
      userId: user.id,
      provider: 'google',
      encryptedRefreshToken: 'enc',
      scopes: ['calendar'],
      updatedAt: 1,
    });
    const credential = await store.getCredential(user.id, 'google');
    expect(credential?.encryptedRefreshToken).toBe('enc');
    expect(await store.getCredential(user.id, 'slack')).toBeUndefined();
  });
});
