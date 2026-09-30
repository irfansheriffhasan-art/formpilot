import { getItem, removeItem, setItem, type CorrectionEntry } from '../storage/storage';
import type { TargetKey } from '../types/mapping';

/**
 * Correction memory: when the user changes what a field is filled with,
 * FormPilot remembers it for that site, so the next visit gets it right.
 *
 * Stored: hostname + field signature → chosen target. That's page metadata
 * (which site, which field), never a profile value.
 */

/** Oldest entries are dropped past this, so storage can't grow forever. */
const MAX_ENTRIES = 500;

const keyFor = (hostname: string, signature: string) => `${hostname}|${signature}`;

async function readAll(): Promise<Record<string, CorrectionEntry>> {
  return (await getItem('corrections')) ?? {};
}

/** This site's corrections, as the mapper expects them: signature → target. */
export async function getCorrectionsForHost(hostname: string): Promise<Record<string, TargetKey | 'ignore'>> {
  const prefix = `${hostname}|`;
  const memory: Record<string, TargetKey | 'ignore'> = {};
  for (const [key, entry] of Object.entries(await readAll())) {
    if (key.startsWith(prefix)) memory[key.slice(prefix.length)] = entry.target;
  }
  return memory;
}

export interface NewCorrection {
  signature: string;
  fieldLabel: string;
  target: TargetKey | 'ignore';
}

export async function saveCorrections(hostname: string, corrections: NewCorrection[]): Promise<void> {
  if (corrections.length === 0) return;
  const all = await readAll();
  const now = new Date().toISOString();
  for (const c of corrections) {
    all[keyFor(hostname, c.signature)] = { hostname, fieldLabel: c.fieldLabel, target: c.target, updatedAt: now };
  }

  const entries = Object.entries(all);
  if (entries.length > MAX_ENTRIES) {
    // ISO timestamps sort correctly as plain strings.
    entries.sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt));
    await setItem('corrections', Object.fromEntries(entries.slice(0, MAX_ENTRIES)));
  } else {
    await setItem('corrections', all);
  }
}

export async function listCorrections(): Promise<CorrectionEntry[]> {
  return Object.values(await readAll()).sort((a, b) => a.hostname.localeCompare(b.hostname));
}

export async function deleteCorrectionsForHost(hostname: string): Promise<void> {
  const remaining = Object.fromEntries(Object.entries(await readAll()).filter(([, entry]) => entry.hostname !== hostname));
  await setItem('corrections', remaining);
}

export async function clearCorrections(): Promise<void> {
  await removeItem('corrections');
}
