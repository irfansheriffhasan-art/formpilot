import type { FormField } from '../types/formField';
import type { AddressSectionKey } from '../types/mapping';
import { tokenize } from './normalizer';

/**
 * Context analysis: the same words can mean different things depending on
 * WHERE they appear. "City" under "Permanent Address" ≠ "City" under
 * "Current Address"; "Name" under "Emergency Contact" isn't your name.
 */

const PERMANENT_WORDS = new Set(['permanent', 'native', 'hometown']);
const CURRENT_WORDS = new Set(['current', 'present', 'correspondence', 'communication', 'mailing', 'residential', 'local', 'temporary']);

/** Section headings that introduce SOMEONE ELSE's details. */
const OTHER_PERSON_WORDS = new Set([
  'father', 'mother', 'guardian', 'parent', 'parents', 'spouse', 'husband', 'wife', 'nominee',
  'emergency', 'reference', 'referee', 'sibling', 'guarantor', 'witness', 'relative',
]);

/** Words that turn a plain "Name" in the section into the parent/guardian name. */
const PARENT_WORDS = new Set(['father', 'guardian', 'parent', 'parents']);

export interface AddressContext {
  section: AddressSectionKey;
  /** Where the hint came from, for the explanation shown to the user. */
  evidence: string;
}

/**
 * Which address the field belongs to. Checks the most specific text first:
 * the label, then helper text, then the section heading.
 * Returns null when nothing says which address it is.
 */
export function detectAddressSection(field: FormField): AddressContext | null {
  const sources: Array<[string | undefined, string]> = [
    [field.label, 'label'],
    [field.surroundingText, 'helper text'],
    [field.sectionHeading, 'section'],
  ];
  for (const [text, where] of sources) {
    const tokens = tokenize(text);
    const permanent = tokens.some((w) => PERMANENT_WORDS.has(w));
    const current = tokens.some((w) => CURRENT_WORDS.has(w));
    // Both words ("Same as permanent? Current address...") → not decisive here.
    if (permanent !== current) {
      return {
        section: permanent ? 'permanentAddress' : 'currentAddress',
        evidence: `${where} “${text}”`,
      };
    }
  }
  return null;
}

export type PersonContext =
  | { kind: 'self' }
  | { kind: 'other'; heading: string }
  /** Section is about the parent/guardian: a bare "Name" means their name. */
  | { kind: 'parent'; heading: string };

/** Whether the field's section is about the user or about someone else. */
export function detectPersonContext(field: FormField): PersonContext {
  const heading = field.sectionHeading;
  const tokens = tokenize(heading);
  if (!heading || !tokens.some((w) => OTHER_PERSON_WORDS.has(w))) return { kind: 'self' };
  return tokens.some((w) => PARENT_WORDS.has(w)) ? { kind: 'parent', heading } : { kind: 'other', heading };
}
