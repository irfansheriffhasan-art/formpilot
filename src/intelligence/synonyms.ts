import { tokenize } from './normalizer';

/**
 * The synonym dictionary: every way forms ask for each piece of profile data.
 *
 * A "concept" is the meaning of a field, independent of WHERE it lives.
 * "City" is one concept; whether it means the current or the permanent
 * address city is decided later by contextAnalyzer.ts.
 */
export type ConceptId =
  | 'fullName' | 'firstName' | 'middleName' | 'lastName' | 'legalName' | 'certificateName'
  | 'dateOfBirth' | 'gender' | 'parentGuardianName'
  | 'email' | 'phone'
  | 'fullAddress' | 'addressLine1' | 'addressLine2' | 'city' | 'state' | 'country' | 'pincode'
  | 'college' | 'degree' | 'department' | 'yearOfStudy' | 'skills';

interface ConceptDef {
  id: ConceptId;
  /** Written naturally; tokenized once when this module loads. */
  phrases: string[];
  /** If any of these words appear, it's NOT this concept ("Father's Mobile" isn't your phone). */
  exclude?: string[];
  /** Browser-standard autocomplete tokens, a very strong signal. */
  autocomplete?: string[];
}

const OTHER_PEOPLE = ['father', 'mother', 'guardian', 'parent', 'spouse', 'husband', 'wife', 'nominee', 'emergency', 'reference', 'referee', 'relative'];
const SCHOOL_LEVEL = ['sslc', 'ssc', 'hsc', 'hslc', 'puc', '10th', '12th', 'matriculation', 'intermediate', 'secondary', 'board', 'school'];

const CONCEPT_DEFS: ConceptDef[] = [
  {
    id: 'fullName',
    phrases: ['name', 'full name', 'complete name', 'name in full', 'your name'],
    exclude: [
      ...OTHER_PEOPLE, 'first', 'last', 'middle', 'surname', 'given', 'family', 'user', 'login', 'nick', 'display',
      'company', 'organization', 'organisation', 'employer', 'college', 'institute', 'institution', 'university',
      'bank', 'branch', 'place', 'city', 'village', 'town', 'district', 'state', 'country', 'course', 'degree',
      'department', 'project', 'team', 'business', 'file', 'account', 'pet', 'maiden', 'street', 'building',
    ],
    autocomplete: ['name'],
  },
  { id: 'firstName', phrases: ['first name', 'given name', 'forename'], exclude: OTHER_PEOPLE, autocomplete: ['given-name'] },
  { id: 'middleName', phrases: ['middle name', 'middle initial'], exclude: OTHER_PEOPLE, autocomplete: ['additional-name'] },
  { id: 'lastName', phrases: ['last name', 'surname', 'family name', 'sur name'], exclude: OTHER_PEOPLE, autocomplete: ['family-name'] },
  { id: 'legalName', phrases: ['legal name', 'official name', 'name as per id'], exclude: OTHER_PEOPLE },
  {
    id: 'certificateName',
    phrases: ['name as per certificate', 'name on certificate', 'certificate name', 'name as per marksheet', 'name as in records'],
    exclude: OTHER_PEOPLE,
  },
  {
    id: 'dateOfBirth',
    phrases: ['date of birth', 'birth date', 'birthday', 'born on'],
    exclude: OTHER_PEOPLE,
    autocomplete: ['bday'],
  },
  { id: 'gender', phrases: ['gender', 'sex'], exclude: OTHER_PEOPLE, autocomplete: ['sex'] },
  {
    id: 'parentGuardianName',
    phrases: [
      'father name', 'guardian name', 'parent name', 'father guardian name', 'parent guardian name',
      'father husband name', 'name of father', 'name of guardian',
    ],
    exclude: ['phone', 'mobile', 'email', 'occupation', 'income', 'address'],
  },
  {
    id: 'email',
    phrases: ['email', 'email address', 'email id', 'mail id', 'mail', 'electronic mail', 'electronic mail address'],
    exclude: [...OTHER_PEOPLE, 'alternate', 'alternative', 'secondary', 'office', 'work'],
    autocomplete: ['email'],
  },
  {
    id: 'phone',
    phrases: [
      'phone', 'phone number', 'mobile', 'mobile number', 'contact number', 'contact', 'telephone',
      'telephone number', 'cell', 'cell number', 'mobile contact', 'whatsapp number', 'mobile phone',
    ],
    exclude: [...OTHER_PEOPLE, 'alternate', 'alternative', 'secondary', 'office', 'work', 'landline', 'fax', 'extension', 'std', 'code', 'person'],
    autocomplete: ['tel', 'tel-national'],
  },
  {
    id: 'fullAddress',
    phrases: [
      'address', 'full address', 'postal address', 'residential address', 'correspondence address',
      'communication address', 'mailing address', 'permanent address', 'current address', 'present address',
      'home address', 'address for communication',
    ],
    exclude: [...OTHER_PEOPLE, 'line', 'street', '1', '2', 'email', 'mail', 'ip', 'web', 'website', 'url', 'office', 'company', 'college', 'institute', 'school'],
    autocomplete: ['street-address'],
  },
  {
    id: 'addressLine1',
    phrases: [
      'address line 1', 'address 1', 'line 1', 'street address', 'street', 'house number', 'door number',
      'flat number', 'house name', 'building', 'flat', 'address line one',
    ],
    exclude: [...OTHER_PEOPLE, '2', 'two', 'email'],
    autocomplete: ['address-line1'],
  },
  {
    id: 'addressLine2',
    phrases: ['address line 2', 'address 2', 'line 2', 'area', 'locality', 'landmark', 'address line two'],
    exclude: [...OTHER_PEOPLE, '1', 'one', 'code'],
    autocomplete: ['address-line2'],
  },
  { id: 'city', phrases: ['city', 'town', 'city town', 'town city', 'city village'], exclude: [...OTHER_PEOPLE, 'birth', 'college', 'office'], autocomplete: ['address-level2'] },
  { id: 'state', phrases: ['state', 'province', 'state province', 'state union territory', 'region'], exclude: [...OTHER_PEOPLE, 'birth', 'bank', 'domicile'], autocomplete: ['address-level1'] },
  { id: 'country', phrases: ['country', 'nation'], exclude: [...OTHER_PEOPLE, 'code', 'birth', 'citizenship', 'issue', 'passport'], autocomplete: ['country', 'country-name'] },
  {
    id: 'pincode',
    phrases: ['pincode', 'pin code', 'pin', 'postal code', 'zip', 'zip code', 'postcode', 'post code'],
    exclude: OTHER_PEOPLE,
    autocomplete: ['postal-code'],
  },
  {
    id: 'college',
    phrases: ['college', 'college name', 'university', 'institution', 'institute', 'university name', 'institution name'],
    exclude: [...SCHOOL_LEVEL, 'city', 'address', 'code', 'email', 'phone'],
  },
  { id: 'degree', phrases: ['degree', 'course', 'program', 'programme', 'qualification', 'degree name', 'course name'], exclude: [...SCHOOL_LEVEL, 'duration', 'code', 'fee'] },
  { id: 'department', phrases: ['department', 'branch', 'specialization', 'specialisation', 'discipline', 'stream', 'major'], exclude: [...SCHOOL_LEVEL, 'bank', 'ifsc'] },
  { id: 'yearOfStudy', phrases: ['year of study', 'current year', 'study year', 'year of studying'], exclude: SCHOOL_LEVEL },
  { id: 'skills', phrases: ['skills', 'skill set', 'key skills', 'technical skills', 'skills and expertise'] },
];

export interface Concept {
  id: ConceptId;
  phrases: string[][];
  exclude: Set<string>;
  autocomplete: string[];
}

/** Tokenized once, so matching never re-normalizes the dictionary. */
export const CONCEPTS: Concept[] = CONCEPT_DEFS.map((def) => ({
  id: def.id,
  phrases: def.phrases.map((phrase) => tokenize(phrase)).filter((tokens) => tokens.length > 0),
  exclude: new Set(def.exclude ?? []),
  autocomplete: def.autocomplete ?? [],
}));

/**
 * How well a field's words match one phrase, from 0 to 1.
 *
 *   exact:            "city" vs "city"                    → 1.0
 *   in order:         "mobile contact 10" vs "mobile contact" → 0.88
 *   all words, any order: "name father" vs "father name"   → 0.78
 *   half the words:   weak partial credit (max 0.5)
 *
 * Every extra word lowers the score a little: "city" inside
 * "city of birth registration" is a weaker hint than "city" alone.
 */
export function phraseScore(fieldTokens: string[], phrase: string[]): number {
  if (fieldTokens.length === 0 || phrase.length === 0) return 0;
  const extra = fieldTokens.length - phrase.length;

  if (extra === 0 && phrase.every((word, i) => fieldTokens[i] === word)) return 1;
  if (extra > 0 && containsSequence(fieldTokens, phrase)) return Math.max(0.7, 0.92 - 0.04 * extra);

  const present = phrase.filter((word) => fieldTokens.includes(word)).length;
  if (present === phrase.length) return Math.max(0.6, 0.82 - 0.04 * Math.max(extra, 0));
  if (phrase.length >= 2 && present / phrase.length >= 0.5) return 0.5 * (present / phrase.length);
  return 0;
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((word, i) => haystack[start + i] === word)) return true;
  }
  return false;
}

/** Best score of a concept against a field's words (0 if an excluded word is present). */
export function conceptScore(concept: Concept, fieldTokens: string[]): number {
  if (fieldTokens.some((word) => concept.exclude.has(word))) return 0;
  return Math.max(0, ...concept.phrases.map((phrase) => phraseScore(fieldTokens, phrase)));
}
