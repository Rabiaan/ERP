import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface KmsProvider {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export class KmsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KmsError';
  }
}

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class LocalKmsProvider implements KmsProvider {
  readonly #key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new KmsError(`KMS key must be ${KEY_BYTES} bytes`);
    }
    this.#key = key;
  }

  async encrypt(plaintext: string): Promise<string> {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  async decrypt(ciphertext: string): Promise<string> {
    const parts = ciphertext.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new KmsError('Unsupported ciphertext format');
    }

    const ivPart = parts[1];
    const tagPart = parts[2];
    const dataPart = parts[3];

    if (!ivPart || !tagPart || !dataPart) {
      throw new KmsError('Ciphertext is incomplete');
    }

    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    const data = Buffer.from(dataPart, 'base64url');

    if (iv.length !== IV_BYTES || tag.length !== 16) {
      throw new KmsError('Ciphertext parameters are invalid');
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.#key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
      throw new KmsError('Unable to decrypt ciphertext');
    }
  }
}
