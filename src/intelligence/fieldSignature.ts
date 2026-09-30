import type { FormField } from '../types/formField';
import { normalizeText } from './normalizer';

/**
 * A stable fingerprint for "this field on this site", used by correction
 * memory. Built only from page metadata (label, name, id, section, type),
 * never from values. Changes if the site renames or restructures the field,
 * which is what we want: then the old correction may no longer apply.
 */
export function fieldSignature(field: FormField): string {
  return [
    normalizeText(field.label),
    field.name ?? '',
    field.id ?? '',
    normalizeText(field.sectionHeading),
    field.type,
  ].join('|');
}
