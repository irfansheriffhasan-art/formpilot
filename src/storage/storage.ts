import type { UserProfile } from '../profiles/profileTypes';
import {
  checkPassphrase,
  decryptJson,
  deriveKey,
  encryptJson,
  exportKey,
  fromBase64,
  importKey,
  PBKDF2_ITERATIONS,
  randomBytes,
  toBase64,
  type EncryptedVault,
} from '../security/vault';
import type { TargetKey } from '../types/mapping';

/**
 * The storage layer: the ONLY file in FormPilot that calls chrome.storage.
 *
 * Why wrap it?
 * 1. Types. StorageSchema lists every key and its type.
 * 2. Encryption. Profiles and corrections live inside an encrypted vault.
 *    Callers still write `getItem('profiles')`; this file decrypts.
 * 3. Privacy by structure. The content script (which runs inside web pages)
 *    must never import this file.
 *
 * On disk (chrome.storage.local):   { vault: EncryptedVault, activeProfileId }
 * In memory (chrome.storage.session): { vaultKey } while unlocked.
 *
 * chrome.storage.session is kept in RAM, cleared when the browser closes,
 * and by default readable only by extension pages and the service worker,
 * never by content scripts or websites.
 */

/** Every key FormPilot stores, and the type of the value under it. */
export interface StorageSchema {
  /** All profiles, keyed by profile id for fast lookup. (Encrypted.) */
  profiles: Record<string, UserProfile>;
  /** The profile selected in the popup. A random id, not personal data. */
  activeProfileId: string;
  /** Fixes the user made in the popup, keyed by "hostname|field signature". (Encrypted.) */
  corrections: Record<string, CorrectionEntry>;
}

export interface CorrectionEntry {
  hostname: string;
  /** The site's label for the field, shown in the options page. */
  fieldLabel: string;
  target: TargetKey | 'ignore';
  updatedAt: string;
}

export type StorageKey = keyof StorageSchema;

const SECURE_KEYS: ReadonlySet<StorageKey> = new Set<StorageKey>(['profiles', 'corrections']);
type VaultContents = Partial<Pick<StorageSchema, 'profiles' | 'corrections'>>;

/** The unlocked key is forgotten after this long without use. */
export const AUTO_LOCK_MS = 15 * 60 * 1000;
/** Avoid writing to session storage on every single read. */
const TOUCH_INTERVAL_MS = 60 * 1000;

interface SessionKey {
  key: string;
  lastUsed: number;
}

/** Thrown when encrypted data is needed but the vault is locked or not set up. */
export class VaultLockedError extends Error {
  constructor() {
    super('FormPilot is locked.');
    this.name = 'VaultLockedError';
  }
}

// ---------- Vault internals ----------

async function readRawVault(): Promise<EncryptedVault | undefined> {
  return (await chrome.storage.local.get('vault')).vault as EncryptedVault | undefined;
}

/** The current key, or null if locked. Expired keys are deleted here. */
async function getSessionKey(): Promise<CryptoKey | null> {
  const session = (await chrome.storage.session.get('vaultKey')).vaultKey as SessionKey | undefined;
  if (!session) return null;
  const now = Date.now();
  if (now - session.lastUsed > AUTO_LOCK_MS) {
    await chrome.storage.session.remove('vaultKey');
    return null;
  }
  if (now - session.lastUsed > TOUCH_INTERVAL_MS) {
    await chrome.storage.session.set({ vaultKey: { ...session, lastUsed: now } });
  }
  return importKey(session.key);
}

async function rememberKey(key: CryptoKey): Promise<void> {
  const session: SessionKey = { key: await exportKey(key), lastUsed: Date.now() };
  await chrome.storage.session.set({ vaultKey: session });
}

async function readVault(): Promise<VaultContents> {
  const [key, vault] = await Promise.all([getSessionKey(), readRawVault()]);
  if (!key || !vault) throw new VaultLockedError();
  return decryptJson<VaultContents>(key, vault);
}

async function writeVault(contents: VaultContents): Promise<void> {
  const [key, vault] = await Promise.all([getSessionKey(), readRawVault()]);
  if (!key || !vault) throw new VaultLockedError();
  await chrome.storage.local.set({ vault: await encryptJson(key, vault.salt, vault.iterations, contents) });
}

// ---------- Typed get / set ----------

/**
 * `K extends StorageKey` makes this generic: the return type depends on
 * which key you ask for. getItem('profiles') returns the profiles map.
 * Encrypted keys throw VaultLockedError while locked.
 */
export async function getItem<K extends StorageKey>(key: K): Promise<StorageSchema[K] | undefined> {
  if (SECURE_KEYS.has(key)) {
    return (await readVault())[key as keyof VaultContents] as StorageSchema[K] | undefined;
  }
  return (await chrome.storage.local.get(key))[key] as StorageSchema[K] | undefined;
}

export async function setItem<K extends StorageKey>(key: K, value: StorageSchema[K]): Promise<void> {
  if (SECURE_KEYS.has(key)) {
    await writeVault({ ...(await readVault()), [key]: value });
    return;
  }
  await chrome.storage.local.set({ [key]: value });
}

export async function removeItem(key: StorageKey): Promise<void> {
  if (SECURE_KEYS.has(key)) {
    const contents = await readVault();
    delete contents[key as keyof VaultContents];
    await writeVault(contents);
    return;
  }
  await chrome.storage.local.remove(key);
}

/** Deletes everything FormPilot has stored, including the unlocked key. */
export async function clearAll(): Promise<void> {
  await Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()]);
}

/**
 * Calls `callback` whenever `key` changes, from ANY part of the extension,
 * so the popup and options page stay in sync. For encrypted keys it also
 * fires on lock/unlock, since that changes whether the data is readable.
 *
 * Returns an "unsubscribe" function for React cleanup.
 */
export function onItemChanged(key: StorageKey, callback: () => void): () => void {
  const secure = SECURE_KEYS.has(key);
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'local' && (secure ? 'vault' in changes : key in changes)) callback();
    if (secure && areaName === 'session' && lockStateChanged(changes)) callback();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** True if a session change locked or unlocked the vault (not just a "last used" update). */
function lockStateChanged(changes: Record<string, chrome.storage.StorageChange>): boolean {
  const change = changes.vaultKey;
  return change !== undefined && Boolean(change.oldValue) !== Boolean(change.newValue);
}

// ---------- Locking ----------

export type VaultStatus = 'setup-needed' | 'locked' | 'unlocked';

export async function getVaultStatus(): Promise<VaultStatus> {
  if (!(await readRawVault())) return 'setup-needed';
  return (await getSessionKey()) ? 'unlocked' : 'locked';
}

/** True if an older FormPilot version left unencrypted profiles on disk. */
export async function hasUnencryptedData(): Promise<boolean> {
  const legacy = await chrome.storage.local.get(['profiles', 'corrections']);
  return legacy.profiles !== undefined || legacy.corrections !== undefined;
}

/**
 * First-time setup: creates the vault and unlocks it. Unencrypted data from
 * older versions is moved inside, then the readable copies are deleted.
 * Returns an error message, or null on success.
 */
export async function createVault(passphrase: string): Promise<string | null> {
  const problem = checkPassphrase(passphrase);
  if (problem) return problem;
  if (await readRawVault()) return 'FormPilot is already protected by a passphrase.';

  const legacy = await chrome.storage.local.get(['profiles', 'corrections']);
  const contents = { profiles: legacy.profiles, corrections: legacy.corrections } as VaultContents;

  const salt = toBase64(randomBytes(16));
  const key = await deriveKey(passphrase, fromBase64(salt), PBKDF2_ITERATIONS);
  await chrome.storage.local.set({ vault: await encryptJson(key, salt, PBKDF2_ITERATIONS, contents) });
  await chrome.storage.local.remove(['profiles', 'corrections']);
  await rememberKey(key);
  return null;
}

/** Returns true if the passphrase was right. */
export async function unlockVault(passphrase: string): Promise<boolean> {
  const vault = await readRawVault();
  if (!vault) return false;
  const key = await deriveKey(passphrase, fromBase64(vault.salt), vault.iterations);
  try {
    // AES-GCM refuses to decrypt with the wrong key: that's our check.
    await decryptJson(key, vault);
  } catch {
    return false;
  }
  await rememberKey(key);
  return true;
}

export async function lockVault(): Promise<void> {
  await chrome.storage.session.remove('vaultKey');
}

/** Re-encrypts everything under a new passphrase (and a new salt). Returns an error message or null. */
export async function changePassphrase(current: string, next: string): Promise<string | null> {
  const problem = checkPassphrase(next);
  if (problem) return problem;
  const vault = await readRawVault();
  if (!vault) return 'FormPilot isn’t set up yet.';

  let contents: VaultContents;
  try {
    contents = await decryptJson<VaultContents>(await deriveKey(current, fromBase64(vault.salt), vault.iterations), vault);
  } catch {
    return 'The current passphrase is wrong.';
  }

  const salt = toBase64(randomBytes(16));
  const key = await deriveKey(next, fromBase64(salt), PBKDF2_ITERATIONS);
  await chrome.storage.local.set({ vault: await encryptJson(key, salt, PBKDF2_ITERATIONS, contents) });
  await rememberKey(key);
  return null;
}

/** Fires when the vault is created, locked, unlocked, or deleted. */
export function onVaultStatusChanged(callback: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'session' && lockStateChanged(changes)) callback();
    if (areaName === 'local' && 'vault' in changes && Boolean(changes.vault.oldValue) !== Boolean(changes.vault.newValue)) callback();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
