import { clearAll, getItem, removeItem, setItem } from '../storage/storage';
import { getProfileValue, PROFILE_FIELDS } from './profileSchema';
import { PROFILE_SCHEMA_VERSION, type UserProfile } from './profileTypes';

/**
 * Profile manager: the business rules for profiles.
 *
 * The UI calls these functions and never touches storage directly.
 * This file decides what a valid profile is, cleans data before saving,
 * and keeps related data consistent (e.g. deleting the active profile).
 */

/** Maps a field path (or "profileName", or "custom:<id>") to an error message. */
export type ValidationErrors = Record<string, string>;

/** Thrown by saveProfile so the UI can show errors next to each field. */
export class ProfileValidationError extends Error {
  readonly errors: ValidationErrors;

  constructor(errors: ValidationErrors) {
    super('Some fields need attention.');
    this.name = 'ProfileValidationError';
    this.errors = errors;
  }
}

async function readAll(): Promise<Record<string, UserProfile>> {
  // `?? {}` handles the very first run, when nothing is stored yet.
  return (await getItem('profiles')) ?? {};
}

export async function listProfiles(): Promise<UserProfile[]> {
  const all = await readAll();
  return Object.values(all).sort((a, b) => a.profileName.localeCompare(b.profileName));
}

export async function getProfile(id: string): Promise<UserProfile | undefined> {
  const all = await readAll();
  return all[id];
}

export function createEmptyProfile(profileName: string): UserProfile {
  const now = new Date().toISOString();
  return {
    // randomUUID gives a collision-proof id without needing a server.
    id: crypto.randomUUID(),
    profileName,
    personal: {},
    contact: {},
    currentAddress: {},
    permanentAddress: {},
    education: {},
    customFields: [],
    schemaVersion: PROFILE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates and stores a new empty profile named "New profile"
 * (or "New profile 2", "New profile 3"... if that name is taken).
 */
export async function createProfile(): Promise<UserProfile> {
  const all = await readAll();
  const takenNames = new Set(Object.values(all).map((p) => p.profileName.toLowerCase()));

  let name = 'New profile';
  for (let n = 2; takenNames.has(name.toLowerCase()); n++) {
    name = `New profile ${n}`;
  }

  const profile = createEmptyProfile(name);
  await setItem('profiles', { ...all, [profile.id]: profile });
  return profile;
}

/**
 * Checks a profile and returns every problem found (empty object = valid).
 * Pure function: no storage access, so the editor can call it on every
 * save attempt without waiting.
 */
export function validateProfile(profile: UserProfile): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!profile.profileName.trim()) {
    errors.profileName = 'Give this profile a name.';
  }

  // Each schema field brings its own validator, so adding a field to
  // profileSchema.ts automatically includes it here.
  for (const field of PROFILE_FIELDS) {
    const value = getProfileValue(profile, field.path)?.trim();
    if (value && field.validate) {
      const message = field.validate(value);
      if (message) errors[field.path] = message;
    }
  }

  const seenLabels = new Set<string>();
  for (const custom of profile.customFields) {
    const label = custom.label.trim();
    const value = custom.value.trim();
    const errorKey = `custom:${custom.id}`;

    if (value && !label) {
      errors[errorKey] = 'Add a field name so FormPilot knows what this value is.';
    } else if (label && !value) {
      errors[errorKey] = 'Add a value, or remove this field.';
    } else if (label && seenLabels.has(label.toLowerCase())) {
      errors[errorKey] = 'You already have a custom field with this name.';
    }
    if (label) seenLabels.add(label.toLowerCase());
  }

  return errors;
}

/**
 * Trims every value and removes empty ones, so "missing" is always
 * `undefined` rather than "" or "   ". The mapper relies on this later
 * to tell "the user has this info" from "the user doesn't".
 */
function cleanSection<T extends Record<string, string | undefined>>(section: T): T {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(section)) {
    const trimmed = value?.trim();
    if (trimmed) cleaned[key] = trimmed;
  }
  return cleaned as T;
}

function cleanProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    profileName: profile.profileName.trim(),
    personal: cleanSection(profile.personal),
    contact: cleanSection(profile.contact),
    currentAddress: cleanSection(profile.currentAddress),
    permanentAddress: cleanSection(profile.permanentAddress),
    education: cleanSection(profile.education),
    customFields: profile.customFields
      .map((field) => ({ ...field, label: field.label.trim(), value: field.value.trim() }))
      .filter((field) => field.label || field.value),
  };
}

/**
 * Validates, cleans, and stores a profile (new or existing).
 * Throws ProfileValidationError if anything is wrong; nothing is saved then.
 */
export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  const errors = validateProfile(profile);
  if (Object.keys(errors).length > 0) {
    throw new ProfileValidationError(errors);
  }

  const all = await readAll();
  const cleaned = cleanProfile(profile);

  // Duplicate names would make the popup's profile selector ambiguous.
  const nameTaken = Object.values(all).some(
    (other) =>
      other.id !== cleaned.id &&
      other.profileName.toLowerCase() === cleaned.profileName.toLowerCase(),
  );
  if (nameTaken) {
    throw new ProfileValidationError({ profileName: 'Another profile already uses this name.' });
  }

  const saved: UserProfile = { ...cleaned, updatedAt: new Date().toISOString() };
  await setItem('profiles', { ...all, [saved.id]: saved });
  return saved;
}

export async function deleteProfile(id: string): Promise<void> {
  const all = await readAll();
  if (!(id in all)) return;

  const remaining = { ...all };
  delete remaining[id];
  await setItem('profiles', remaining);

  // Don't leave the popup pointing at a profile that no longer exists.
  if ((await getActiveProfileId()) === id) {
    await removeItem('activeProfileId');
  }
}

/** Removes every profile and setting. There is no undo. */
export async function deleteAllData(): Promise<void> {
  await clearAll();
}

export async function getActiveProfileId(): Promise<string | undefined> {
  return getItem('activeProfileId');
}

export async function setActiveProfileId(id: string): Promise<void> {
  await setItem('activeProfileId', id);
}
