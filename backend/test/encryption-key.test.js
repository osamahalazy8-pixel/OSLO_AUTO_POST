import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveEncryptionKey } from '../src/encryption-key.js';

test('keeps 64-character hexadecimal encryption keys unchanged', () => {
  const value = '0123456789abcdef'.repeat(4);
  assert.deepEqual(deriveEncryptionKey(value), Buffer.from(value, 'hex'));
});

test('accepts base64-encoded 32-byte encryption keys', () => {
  const expected = Buffer.alloc(32, 0x5a);
  const value = expected.toString('base64');
  assert.deepEqual(deriveEncryptionKey(value), expected);
});

test('derives a stable 32-byte key from a Render passphrase', () => {
  const phrase = 'a-render-encryption-passphrase';
  const first = deriveEncryptionKey(phrase);
  const second = deriveEncryptionKey(phrase);
  assert.equal(first.length, 32);
  assert.deepEqual(first, second);
});

test('rejects empty or too-short passphrases with actionable guidance', () => {
  assert.throws(() => deriveEncryptionKey(''), /cannot be empty/);
  assert.throws(() => deriveEncryptionKey('short'), /at least 16 characters/);
});
