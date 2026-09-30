/**
 * The shape of a FormPilot profile.
 *
 * Every value is an optional string. Web forms deal in text, so storing
 * strings avoids converting back and forth. "Optional" matters: a missing
 * value means "the user never told us", which the mapper will later report
 * as unavailable instead of guessing.
 */

/** Bump this when the stored shape changes, so old data can be migrated. */
export const PROFILE_SCHEMA_VERSION = 1;

// These are `type` aliases rather than `interface`s on purpose: type aliases
// are assignable to Record<string, string | undefined>, which lets generic
// helpers (getProfileValue, cleanSection) treat any section as a simple map.
export type PersonalInfo = {
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  /** Name on official ID documents, if different from fullName. */
  legalName?: string;
  /** Name exactly as printed on certificates. */
  certificateName?: string;
  /** Stored as ISO "YYYY-MM-DD". Converted to each site's format when filling. */
  dateOfBirth?: string;
  gender?: string;
  parentGuardianName?: string;
};

export type ContactInfo = {
  email?: string;
  phone?: string;
};

export type AddressInfo = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
};

export type EducationInfo = {
  college?: string;
  degree?: string;
  department?: string;
  yearOfStudy?: string;
  /** Free text, usually comma-separated. */
  skills?: string;
};

/** A user-defined field, e.g. "University Registration Number". */
export interface CustomField {
  /** Stable id so the field can be renamed without losing its identity. */
  id: string;
  /** How the user describes the field. The mapper will match against this. */
  label: string;
  value: string;
  /** If true, FormPilot must ask before filling this value. */
  sensitive: boolean;
}

/** The standard sections. Each one groups related fields. */
export interface ProfileSections {
  personal: PersonalInfo;
  contact: ContactInfo;
  currentAddress: AddressInfo;
  permanentAddress: AddressInfo;
  education: EducationInfo;
}

export interface UserProfile extends ProfileSections {
  id: string;
  /** The user's name for the profile, e.g. "Personal" or "Father". */
  profileName: string;
  customFields: CustomField[];
  schemaVersion: number;
  /** ISO timestamps. Useful for sorting and debugging, never sensitive. */
  createdAt: string;
  updatedAt: string;
}

export type SectionKey = keyof ProfileSections;

/**
 * Every valid "section.field" path, generated from the types above:
 * "personal.fullName" | "contact.email" | "currentAddress.city" | ...
 *
 * How it works: for each section S, build the template-literal type
 * `${S}.${each key of that section}`, then take the union of all of them.
 * If you add a field to PersonalInfo, its path appears here automatically,
 * and a typo like "personal.fulName" becomes a compile error.
 */
export type ProfileFieldPath = {
  [S in SectionKey]: `${S}.${Extract<keyof ProfileSections[S], string>}`;
}[SectionKey];
