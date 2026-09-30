import { describe, expect, it } from 'vitest';
import { checkPassphrase, decryptJson, deriveKey, encryptJson, exportKey, fromBase64, importKey, randomBytes, toBase64 } from './vault';

// Fewer rounds keep the tests fast; the algorithm is identical.
const ROUNDS = 1_000;
const data = { profiles: { p1: { fullName: 'Asha Kumar', aadhaar: '1234 5678 9012' } } };

async function setup(passphrase = 'correct horse battery') {
  const salt = toBase64(randomBytes(16));
  const key = await deriveKey(passphrase, fromBase64(salt), ROUNDS);
  return { salt, key, vault: await encryptJson(key, salt, ROUNDS, data) };
}

describe('vault', () => {
  it('round-trips data', async () => {
    const { key, vault } = await setup();
    expect(await decryptJson(key, vault)).toEqual(data);
  });

  it('does not store the data in readable form', async () => {
    const { vault } = await setup();
    const onDisk = JSON.stringify(vault);
    expect(onDisk).not.toContain('Asha');
    expect(atob(vault.ciphertext)).not.toContain('Asha');
  });

  it('rejects a wrong passphrase', async () => {
    const { salt, vault } = await setup();
    const wrong = await deriveKey('wrong passphrase', fromBase64(salt), ROUNDS);
    await expect(decryptJson(wrong, vault)).rejects.toThrow();
  });

  it('detects tampering', async () => {
    const { key, vault } = await setup();
    const bytes = fromBase64(vault.ciphertext);
    bytes[0] ^= 1;
    await expect(decryptJson(key, { ...vault, ciphertext: toBase64(bytes) })).rejects.toThrow();
  });

  it('uses a fresh IV every time', async () => {
    const { key, salt } = await setup();
    const a = await encryptJson(key, salt, ROUNDS, data);
    const b = await encryptJson(key, salt, ROUNDS, data);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('survives export/import of the session key', async () => {
    const { key, vault } = await setup();
    const reimported = await importKey(await exportKey(key));
    expect(await decryptJson(reimported, vault)).toEqual(data);
  });

  it('checks passphrase length', () => {
    expect(checkPassphrase('short')).not.toBeNull();
    expect(checkPassphrase('long enough phrase')).toBeNull();
    expect(checkPassphrase(' padded passphrase ')).not.toBeNull();
  });
});
