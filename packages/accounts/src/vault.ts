import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ForgewrightError } from '@forgewright/shared';

import type { SecretVault } from './types.js';

const ALGORITHM = 'aes-256-gcm';

/**
 * AES-256-GCM secret vault. Encrypts each value with a random IV and an
 * authentication tag; output is `iv.tag.ciphertext` (base64). Tampered or
 * wrong-key tokens fail to decrypt.
 */
export class AesGcmVault implements SecretVault {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new ForgewrightError('CONFIG_INVALID', 'Vault key must be 32 bytes (256 bits)');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
  }

  decrypt(token: string): string {
    const [ivPart, tagPart, ctPart] = token.split('.');
    if (!ivPart || !tagPart || !ctPart) {
      throw new ForgewrightError('INTERNAL', 'Malformed encrypted token');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctPart, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

/** Build a vault from a 64-char hex key (32 bytes). */
export const vaultFromHexKey = (hexKey: string): AesGcmVault => {
  const key = Buffer.from(hexKey, 'hex');
  return new AesGcmVault(key);
};

/** Generate a fresh 32-byte key as hex (for FORGE_SECRET_KEY). */
export const generateKeyHex = (): string => randomBytes(32).toString('hex');
