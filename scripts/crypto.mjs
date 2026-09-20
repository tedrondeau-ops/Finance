import crypto from 'node:crypto';

const ITERATIONS = 210000;

// Encrypts with AES-256-GCM, key derived via PBKDF2-SHA256 from the PIN.
// Output shape matches what the browser's SubtleCrypto AES-GCM decrypt expects:
// ciphertext and auth tag concatenated into one buffer.
export function encryptJSON(obj, pin) {
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(pin, salt, ITERATIONS, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iterations: ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    data: Buffer.concat([ciphertext, tag]).toString('base64'),
  };
}

export function decryptJSON(bundle, pin) {
  const salt = Buffer.from(bundle.salt, 'base64');
  const iv = Buffer.from(bundle.iv, 'base64');
  const combined = Buffer.from(bundle.data, 'base64');
  const tag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(0, combined.length - 16);
  const key = crypto.pbkdf2Sync(pin, salt, bundle.iterations || ITERATIONS, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}
