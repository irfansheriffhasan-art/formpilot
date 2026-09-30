import type {
  ProfileFieldPath,
  ProfileSections,
  SectionKey,
} from './profileTypes';

/**
 * profileTypes.ts says what a profile IS (for the compiler).
 * This file describes each field for PEOPLE and for the UI: its label,
 * which input to render, and how to validate it.
 *
 * Keeping this as data means the editor renders itself from this list,
 * and later the mapper can use the same list as its set of targets.
 */

export type FieldInputType = 'text' | 'email' | 'tel' | 'date' | 'textarea';

export interface SectionDef {
  key: SectionKey;
  title: string;
  description?: string;
}

export interface ProfileFieldDef {
  path: ProfileFieldPath;
  label: string;
  inputType: FieldInputType;
  hint?: string;
  /** Span the full width of the editor grid. */
  wide?: boolean;
  /** Returns an error message, or null if the value is acceptable. */
  validate?: (value: string) => string | null;
}

export const PROFILE_SECTIONS: SectionDef[] = [
  { key: 'personal', title: 'Personal details' },
  { key: 'contact', title: 'Contact' },
  { key: 'currentAddress', title: 'Current address', description: 'Where you live now.' },
  {
    key: 'permanentAddress',
    title: 'Permanent address',
    description: 'Your home or native address. Forms often ask for both.',
  },
  { key: 'education', title: 'Education' },
];

// ---------- Validators ----------
// Deliberately lenient: the goal is catching typos, not rejecting real data.
// Error messages never include the value itself.

function validateEmail(value: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? null
    : 'Enter an email like name@example.com.';
}

function validatePhone(value: string): string | null {
  // Allow common formatting characters, then require 7–15 digits
  // (15 is the international maximum for phone numbers).
  const digits = value.replace(/[\s\-()+]/g, '');
  return /^\d{7,15}$/.test(digits)
    ? null
    : 'Enter 7–15 digits. Spaces, +, - and brackets are fine.';
}

function validatePostalCode(value: string): string | null {
  return /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(value)
    ? null
    : 'Enter a valid pincode or postal code.';
}

function validatePastDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Enter a valid date.';
  return date > new Date() ? 'Date of birth can’t be in the future.' : null;
}

/** Both address sections have identical fields, so we generate them. */
function addressFields(section: 'currentAddress' | 'permanentAddress'): ProfileFieldDef[] {
  return [
    { path: `${section}.line1`, label: 'Address line 1', inputType: 'text', wide: true },
    { path: `${section}.line2`, label: 'Address line 2', inputType: 'text', wide: true },
    { path: `${section}.city`, label: 'City', inputType: 'text' },
    { path: `${section}.state`, label: 'State', inputType: 'text' },
    { path: `${section}.country`, label: 'Country', inputType: 'text' },
    { path: `${section}.pincode`, label: 'Pincode', inputType: 'text', validate: validatePostalCode },
  ];
}

export const PROFILE_FIELDS: ProfileFieldDef[] = [
  { path: 'personal.fullName', label: 'Full name', inputType: 'text', wide: true, hint: 'As you usually write it.' },
  { path: 'personal.firstName', label: 'First name', inputType: 'text' },
  { path: 'personal.middleName', label: 'Middle name', inputType: 'text' },
  { path: 'personal.lastName', label: 'Last name', inputType: 'text' },
  { path: 'personal.legalName', label: 'Legal name', inputType: 'text', hint: 'Only if different from your full name, e.g. on your ID.' },
  { path: 'personal.certificateName', label: 'Name on certificates', inputType: 'text', hint: 'Exactly as printed, including initials.' },
  { path: 'personal.dateOfBirth', label: 'Date of birth', inputType: 'date', validate: validatePastDate },
  { path: 'personal.gender', label: 'Gender', inputType: 'text' },
  { path: 'personal.parentGuardianName', label: 'Parent or guardian name', inputType: 'text' },

  { path: 'contact.email', label: 'Email', inputType: 'email', validate: validateEmail },
  { path: 'contact.phone', label: 'Phone', inputType: 'tel', validate: validatePhone },

  ...addressFields('currentAddress'),
  ...addressFields('permanentAddress'),

  { path: 'education.college', label: 'College', inputType: 'text', wide: true },
  { path: 'education.degree', label: 'Degree', inputType: 'text' },
  { path: 'education.department', label: 'Department', inputType: 'text' },
  { path: 'education.yearOfStudy', label: 'Year of study', inputType: 'text' },
  { path: 'education.skills', label: 'Skills', inputType: 'textarea', wide: true, hint: 'Separate skills with commas.' },
];

export function fieldsForSection(section: SectionKey): ProfileFieldDef[] {
  return PROFILE_FIELDS.filter((field) => field.path.startsWith(`${section}.`));
}

// ---------- Path helpers ----------

function splitPath(path: ProfileFieldPath): [SectionKey, string] {
  const dot = path.indexOf('.');
  return [path.slice(0, dot) as SectionKey, path.slice(dot + 1)];
}

/**
 * Reads a value by path, e.g. getProfileValue(profile, 'contact.email').
 * The mapper will use this to turn "profile field = contact.email" into a value.
 */
export function getProfileValue(
  profile: ProfileSections,
  path: ProfileFieldPath,
): string | undefined {
  const [section, key] = splitPath(path);
  const sectionData: Record<string, string | undefined> = profile[section];
  return sectionData[key];
}

/**
 * Returns a NEW profile with one value changed. It never mutates the input:
 * React only re-renders when it receives a new object, so in-place edits
 * would silently fail to update the screen.
 */
export function setProfileValue<T extends ProfileSections>(
  profile: T,
  path: ProfileFieldPath,
  value: string,
): T {
  const [section, key] = splitPath(path);
  return { ...profile, [section]: { ...profile[section], [key]: value } };
}
