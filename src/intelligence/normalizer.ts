import { GENERIC_ID_WORDS, humanizeIdentifier } from '../utils/text';

/**
 * Text normalization: turns messy label text into clean, comparable words.
 *
 *   "Mobile No.:"               → "mobile number"
 *   "D.O.B (DD/MM/YYYY)"        → "date of birth dd mm yyyy"
 *   "Father's / Guardian's Name" → "father guardian name"
 *
 * This file handles SPELLING ("E-Mail" and "email" are the same word).
 * MEANING ("Mail ID" ≈ "email") belongs to synonyms.ts.
 *
 * Pure functions only: no DOM, no chrome APIs.
 */

/** Short forms expanded word by word. Values may be several words. */
const ABBREVIATIONS: Record<string, string> = {
  dob: 'date of birth',
  bday: 'birthday',
  num: 'number',
  nbr: 'number',
  addr: 'address',
  add1: 'address 1',
  dept: 'department',
  qual: 'qualification',
  yr: 'year',
  yop: 'year of passing',
  mob: 'mobile',
  mobno: 'mobile number',
  ph: 'phone',
  tel: 'telephone',
  fname: 'first name',
  lname: 'last name',
  mname: 'middle name',
  dist: 'district',
  univ: 'university',
  emailid: 'email id',
  mailid: 'mail id',
  zipcode: 'zip code',
  // Common misspellings of Aadhaar.
  aadhar: 'aadhaar',
  adhaar: 'aadhaar',
  adhar: 'aadhaar',
};

/** Multi-word fixes applied to the finished string. */
const PHRASE_FIXES: Array<[RegExp, string]> = [
  [/\be mail\b/g, 'email'],
  [/\bph no\b/g, 'phone number'],
];

/**
 * Words that carry no meaning for matching: filler ("please enter your"),
 * people words that forms add to every label ("Candidate Name" means
 * "Name"), and format hints ("DD/MM/YYYY", "10 digits").
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'in', 'on', 'at', 'to', 'and', 'or', 'as', 'per', 'is', 'are', 'be',
  'by', 'with', 'if', 'any', 'this', 'that', 'here', 'only',
  'your', 'my', 'our', 'please', 'enter', 'type', 'provide', 'fill', 'give',
  'applicant', 'applicants', 'candidate', 'candidates', 'student', 'students',
  'dd', 'mm', 'yyyy', 'yy', 'mmm',
  'digit', 'digits', 'character', 'characters', 'format', 'eg', 'ie', 'etc',
  'optional', 'mandatory', 'required', 'valid',
]);

/**
 * Normalizes text for matching (never for display; the popup keeps showing
 * the site's original label).
 *
 * Order matters:
 *  1. Unicode clean-up (é → e, curly quotes → straight).
 *  2. Drop possessives ("Father's" → "Father").
 *  3. Collapse dotted acronyms BEFORE removing punctuation, or "D.O.B"
 *     would become "d o b" and no abbreviation rule could recognise it.
 *  4. Split identifiers (camelCase, snake_case). This needs the original
 *     capitals, so it runs before anything lowercases the text.
 *  5. Punctuation → spaces, then expand abbreviations word by word.
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';

  let result = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // accents split off by NFKD
    .replace(/[‘’`´]/g, "'")
    .replace(/'s\b/gi, '')
    .replace(/'/g, '')
    // "D.O.B." → "DOB", "e.g." → "eg"
    .replace(/\b(?:[a-z]\.)+[a-z]\b\.?/gi, (match) => match.replace(/\./g, ''))
    // "A/C" → "AC", "S/O" → "SO"
    .replace(/\b([a-z])\/([a-z])\b/gi, '$1$2');

  result = humanizeIdentifier(result)
    .replace(/([a-z])(\d)/g, '$1 $2')  // "line1" → "line 1" (but "10th" stays)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const words = result.split(' ').filter(Boolean);
  const expanded = words.map((word, index) => {
    // "No" means "number" only after another word ("Mobile No", "Roll No.").
    // On its own it's an answer, as in a Yes/No option.
    if (word === 'no') {
      return index > 0 && words[index - 1] !== 'yes' ? 'number' : word;
    }
    return ABBREVIATIONS[word] ?? word;
  });

  result = expanded.join(' ');
  for (const [pattern, replacement] of PHRASE_FIXES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Normalizes, then splits into meaningful words (stopwords and single
 * letters removed). The matcher compares these arrays.
 *
 *   tokenize("Please enter your Mobile No.") → ["mobile", "number"]
 */
export function tokenize(text: string | null | undefined): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((word) => word && !STOPWORDS.has(word) && !/^[a-z]$/.test(word));
}

/**
 * Like tokenize, but for name/id attributes, which add framework noise:
 * "ctl00$Main$txtDOB" → ["date", "birth"] (not "ctl", "00", "main", "txt").
 */
export function tokenizeIdentifier(identifier: string | null | undefined): string[] {
  const kept: string[] = [];
  let previousDropped = true;
  for (const word of tokenize(identifier)) {
    // A number is meaningful after a real word ("line 1"), but noise after
    // a generic one ("ctl 00", "input 3").
    const isNoise: boolean = GENERIC_ID_WORDS.has(word) || word === 'ctl' || (/^\d+$/.test(word) && previousDropped);
    if (!isNoise) kept.push(word);
    previousDropped = isNoise;
  }
  return kept;
}
