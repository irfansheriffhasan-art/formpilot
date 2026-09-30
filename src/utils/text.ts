/**
 * Small text helpers shared by the content script and the intelligence layer.
 * Phase 4's normalizer builds on these; these only do light cleanup.
 */

/**
 * Collapses whitespace and strips the decorations forms add around labels:
 * leading "*" or bullets, trailing ":" or "*".
 *   "  Full Name *: " → "Full Name"
 */
export function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[\s:*•\-–]+/, '')
    .replace(/[\s:*]+$/, '')
    .trim();
}

/**
 * Turns programmer identifiers into words:
 *   "candidate_legal_name" → "candidate legal name"
 *   "applicantFullName"    → "applicant full name"
 *   "user[email]"          → "user email"
 *   "ctl00$Main$txtDOB"    → "ctl00 main txt dob"
 */
export function humanizeIdentifier(identifier: string): string {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')     // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')  // DOBField → DOB Field
    .replace(/[_\-.[\]$:]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Words that appear in auto-generated ids but say nothing about meaning.
export const GENERIC_ID_WORDS = new Set([
  'input', 'field', 'text', 'txt', 'tb', 'mat', 'ctl', 'form', 'control',
  'el', 'element', 'item', 'main', 'content', 'body', 'page', 'r', 'id',
]);

/**
 * True if a humanized identifier carries meaning, e.g. "candidate name",
 * rather than framework noise like "mat input 3", "input 12" or ":r5:".
 */
export function isMeaningfulIdentifier(humanized: string): boolean {
  const meaningfulWords = humanized
    .split(' ')
    .filter((word) => /[a-z]{2,}/.test(word) && !GENERIC_ID_WORDS.has(word.replace(/\d+/g, '')));
  return meaningfulWords.join('').length >= 3;
}

export function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}
