import { scryptSync } from 'node:crypto';
import { Buffer } from 'node:buffer';

const KEY_BYTES = 32;
const DERIVATION_SALT = 'OSLO_AUTO_POST_ENCRYPTION_KEY_V1';

export function deriveEncryptionKey(value) {
  const secret = value.trim();
  if (!secret) {
    throw new Error('ENCRYPTION_KEY cannot be empty.');
  }

  if (/^[a-f\d]{64}$/i.test(secret)) {
    return Buffer.from(secret, 'hex');
  }

  if (/^[A-Za-z\d+/]+={0,2}$/.test(secret)) {
    const decoded = Buffer.from(secret, 'base64');
    const canonical = decoded.toString('base64').replace(/=+$/, '');
    if (canonical === secret.replace(/=+$/, '') && decoded.length === KEY_BYTES) {
      return decoded;
    }
  }

  if (Buffer.byteLength(secret, 'utf8') < 16) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex key, a base64-encoded 32-byte key, or a passphrase of at least 16 characters.'
    );
  }

  return scryptSync(secret, DERIVATION_SALT, KEY_BYTES);
}
