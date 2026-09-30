import type { ProfileFieldPath } from '../profiles/profileTypes';

/**
 * Where a form field's value comes from:
 *   "contact.email"          a standard profile field
 *   "currentAddress.full"    the whole address joined into one line
 *   "custom:<id>"            one of the user's custom fields
 */
export type AddressSectionKey = 'currentAddress' | 'permanentAddress';
export type TargetKey = ProfileFieldPath | `${AddressSectionKey}.full` | `custom:${string}`;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Why a field can't be filled, even though FormPilot looked at it. */
export type UnavailableReason =
  | 'no-match'      // no profile field fits
  | 'other-person'  // e.g. "Name" under "Emergency Contact"
  | 'no-value'      // matched, but the profile doesn't have this value
  | 'no-option'     // a select/radio has no choice matching the value
  | 'too-long'      // the value doesn't fit the field's maxlength
  | 'read-only'
  | 'ignored'       // the user said "don't fill" here before
  | 'no-profile';

/** The mapper's decision for one field. Lives only in the popup. */
export interface FieldMapping {
  elementId: string;
  target: TargetKey | null;
  /** 0..1 */
  confidence: number;
  level: ConfidenceLevel;
  /** Human-readable explanation. Never contains profile values. */
  reasons: string[];
  /** Value in the form the site expects (e.g. an option's value). */
  value?: string;
  /** What the popup shows the user (e.g. the option's text). */
  displayValue?: string;
  unavailable?: UnavailableReason;
  /** Filling always needs explicit confirmation. */
  sensitive: boolean;
  source: 'auto' | 'memory' | 'user';
}

export function isFillable(mapping: FieldMapping): boolean {
  return mapping.target !== null && mapping.value !== undefined && !mapping.unavailable;
}
