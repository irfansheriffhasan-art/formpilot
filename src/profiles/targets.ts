import type { AddressSectionKey, TargetKey } from '../types/mapping';
import { getProfileValue, PROFILE_FIELDS, PROFILE_SECTIONS } from './profileSchema';
import type { ProfileFieldPath, UserProfile } from './profileTypes';

/**
 * Everything a form field can be filled FROM, with labels for the popup's
 * "fill with…" dropdown. Pure: reads a profile object, never storage.
 */

export interface TargetOption {
  key: TargetKey;
  label: string;
  sensitive: boolean;
}

const ADDRESS_SECTIONS: AddressSectionKey[] = ['currentAddress', 'permanentAddress'];

function sectionTitle(path: string): string {
  const section = path.slice(0, path.indexOf('.'));
  return PROFILE_SECTIONS.find((s) => s.key === section)?.title ?? section;
}

export function listTargets(profile: UserProfile | null): TargetOption[] {
  const options: TargetOption[] = [];
  for (const field of PROFILE_FIELDS) {
    const isAddress = ADDRESS_SECTIONS.some((s) => field.path.startsWith(`${s}.`));
    options.push({
      key: field.path,
      label: isAddress ? `${sectionTitle(field.path)}: ${field.label}` : field.label,
      sensitive: false,
    });
    // Offer the joined address right after each section's first line.
    if (field.path.endsWith('.line1')) {
      const section = field.path.split('.')[0] as AddressSectionKey;
      options.push({ key: `${section}.full`, label: `${sectionTitle(field.path)}: Full address`, sensitive: false });
    }
  }
  for (const custom of profile?.customFields ?? []) {
    options.push({ key: `custom:${custom.id}`, label: `Custom: ${custom.label}`, sensitive: custom.sensitive });
  }
  return options;
}

export function targetLabel(profile: UserProfile | null, key: TargetKey): string {
  return listTargets(profile).find((option) => option.key === key)?.label ?? 'Unknown field';
}

export function isSensitiveTarget(profile: UserProfile | null, key: TargetKey): boolean {
  return listTargets(profile).find((option) => option.key === key)?.sensitive ?? false;
}

/** Joins an address into one line: "12 Main St, Anna Nagar, Chennai, Tamil Nadu - 600040, India". */
function fullAddress(profile: UserProfile, section: AddressSectionKey): string | undefined {
  const a = profile[section];
  const statePin = [a.state, a.pincode].filter(Boolean).join(' - ');
  const parts = [a.line1, a.line2, a.city, statePin, a.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** The stored value for a target, or undefined if the user hasn't saved one. */
export function resolveTargetValue(profile: UserProfile, key: TargetKey): string | undefined {
  if (key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    return profile.customFields.find((c) => c.id === id)?.value || undefined;
  }
  if (key.endsWith('.full')) {
    return fullAddress(profile, key.split('.')[0] as AddressSectionKey);
  }
  return getProfileValue(profile, key as ProfileFieldPath);
}
