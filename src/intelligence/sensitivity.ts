import type { FormField } from '../types/formField';
import { humanizeIdentifier } from '../utils/text';

/**
 * Decides how risky a field is to fill.
 *
 *   blocked-*  → never filled, not even shown as fillable. These fields are
 *                dropped at scan time, so no later code can fill them by mistake.
 *   sensitive  → allowed, but always needs explicit confirmation (Phase 8).
 *   normal     → regular field.
 *
 * We deliberately err on the side of blocking: a missed autofill costs the
 * user a few seconds of typing; a wrongly filled payment field costs trust.
 */
export type FieldRisk =
  | 'normal'
  | 'sensitive'
  | 'blocked-payment'
  | 'blocked-otp'
  | 'blocked-password';

type RiskInput = Pick<
  FormField,
  'type' | 'label' | 'name' | 'id' | 'placeholder' | 'ariaLabel' | 'title' | 'autocomplete' | 'surroundingText'
>;

// Browser-standard autocomplete tokens: cc-number, cc-csc, cc-exp, etc.
const PAYMENT_AUTOCOMPLETE = /\bcc-|\btransaction-/;
const PASSWORD_AUTOCOMPLETE = /\b(new|current)-password\b/;
const OTP_AUTOCOMPLETE = /\bone-time-code\b/;

const PASSWORD_TEXT = /\bpass ?(word|code)\b|\bpwd\b/;

const OTP_TEXT = /\botp\b|\bone ?time ?(password|code|pin)\b|\bverification code\b|\bcaptcha\b|\bsecurity (answer|question)\b/;

const PAYMENT_TEXT = new RegExp(
  [
    String.raw`\b(credit|debit|atm) ?card\b`,
    // "(?<!...)" is a negative lookbehind: match "card number" only when it
    // is NOT preceded by an ID-card name like "PAN" or "Aadhaar".
    String.raw`(?<!\b(pan|aadh?aa?r|ration|voter ?id|id) ?)\bcard ?(no|num|number)\b`,
    String.raw`\bcvv2?\b`,
    String.raw`\bcvc\b`,
    String.raw`\bcard ?(expiry|expiration|exp)\b`,
    String.raw`\b(upi|atm|m) ?pin\b`,
    String.raw`\baccount ?(no|num|number)\b`,
    String.raw`\ba ?/ ?c ?(no|num|number)\b`,
    String.raw`\bifsc\b`,
    String.raw`\biban\b`,
    String.raw`\bswift\b`,
    String.raw`\brouting ?number\b`,
    String.raw`\bmicr\b`,
  ].join('|'),
);

const SENSITIVE_TEXT = new RegExp(
  [
    String.raw`\baadh?aa?r\b`,
    String.raw`\bpan( ?card| ?no| ?number)?\b`,
    String.raw`\bpassport\b`,
    String.raw`\bvoter ?id\b`,
    String.raw`\bepic ?(no|number)\b`,
    String.raw`\bdriving ?licen[cs]e\b`,
    String.raw`\bssn\b`,
    String.raw`\bsocial security\b`,
    String.raw`\bnational ?id\b`,
    String.raw`\bration ?card\b`,
    String.raw`\buan\b`,
  ].join('|'),
);

export function classifyFieldRisk(field: RiskInput): FieldRisk {
  const autocomplete = (field.autocomplete ?? '').toLowerCase();

  // humanizeIdentifier splits camelCase and snake_case, so "cardNumber"
  // and "card_number" both become "card number" before matching.
  const text = [field.label, field.name, field.id, field.placeholder, field.ariaLabel, field.title]
    .filter((part): part is string => Boolean(part))
    .map(humanizeIdentifier)
    .join(' | ');

  if (field.type === 'password' || PASSWORD_AUTOCOMPLETE.test(autocomplete) || PASSWORD_TEXT.test(text)) {
    return 'blocked-password';
  }
  if (PAYMENT_AUTOCOMPLETE.test(autocomplete) || PAYMENT_TEXT.test(text)) {
    return 'blocked-payment';
  }
  if (OTP_AUTOCOMPLETE.test(autocomplete) || OTP_TEXT.test(text)) {
    return 'blocked-otp';
  }
  if (SENSITIVE_TEXT.test(text) || SENSITIVE_TEXT.test(humanizeIdentifier(field.surroundingText ?? ''))) {
    return 'sensitive';
  }
  return 'normal';
}
