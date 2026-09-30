/**
 * Encryption for data at rest. Pure WebCrypto: no chrome APIs, so it runs
 * in extension pages, the service worker, and unit tests alike.
 *
 * How it works:
 *   passphrase + random salt ──PBKDF2 (600,000 rounds)──▶ 256-bit AES key
 *   JSON data + key + random IV ──AES-GCM──▶ ciphertext
 *
 * Why these choices:
 * - PBKDF2 with many rounds makes each passphrase guess slow (~0.5 s), so
 *   someone who copies the browser's files can't try millions per second.
 * - The salt makes the same passphrase produce different keys for different
 *   users, so precomputed tables are useless.
 * - AES-GCM also AUTHENTICATES: a wrong key or a single changed byte makes
 *   decryption fail loudly instead of returning garbage. That's also how we
 *   check a passphrase: if the vault decrypts, it was right.
 * - A fresh random IV for every encryption. Reusing an IV with the same GCM
 *   key breaks its security completely; this is a classic mistake.
 */

export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 8;

/** What's stored on disk. Everything except `ciphertext` is safe to reveal. */
export interface EncryptedVault {
  version: 1;
  salt: string;       // base64
  iterations: number;
  iv: string;         // base64
  ciphertext: string; // base64
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** Returns an error message, or null if the passphrase is acceptable. */
export function checkPassphrase(passphrase: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters. A few unrelated words is stronger than a short complex password.`;
  }
  if (passphrase.trim() !== passphrase) return 'The passphrase can’t start or end with a space.';
  return null;
}

/**
 * Turns a passphrase into an AES key. `extractable` is true so the raw key
 * can be kept in session storage while unlocked (see storage.ts).
 */
export async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

/** Re-imports a stored key as NON-extractable: code using it can't read it back out. */
export async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJson(key: CryptoKey, salt: string, iterations: number, data: unknown): Promise<EncryptedVault> {
  const iv = randomBytes(12); // 96-bit IV, the size GCM is designed for
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return { version: 1, salt, iterations, iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

/** Throws if the key is wrong or the vault was tampered with. */
export async function decryptJson<T>(key: CryptoKey, vault: EncryptedVault): Promise<T> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv) }, key, fromBase64(vault.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
