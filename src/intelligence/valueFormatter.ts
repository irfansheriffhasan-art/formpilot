import type { FieldOption, FormField } from '../types/formField';
import type { TargetKey } from '../types/mapping';
import { normalizeText } from './normalizer';

/**
 * Converts a stored profile value into what THIS field expects:
 *   - dates: "2004-03-15" → "15/03/2004" when the field says DD/MM/YYYY
 *   - selects and radios: "Male" → the matching option's value ("M")
 *   - phones: "+91 98765 43210" → "9876543210" when the field takes 10 digits
 *
 * It never truncates silently: a value that doesn't fit is reported, not cut.
 */
export type FormatResult =
  | { ok: true; value: string; displayValue: string; notes: string[]; assumed: boolean }
  | { ok: false; reason: 'no-option' | 'too-long' };

export function formatValue(field: FormField, target: TargetKey, raw: string): FormatResult {
  if (field.options && field.options.length > 0) {
    const option = matchOption(field.options, raw);
    return option
      ? { ok: true, value: option.value, displayValue: option.text || option.value, notes: ['One of the site’s choices matches your value.'], assumed: false }
      : { ok: false, reason: 'no-option' };
  }

  let value = raw;
  const notes: string[] = [];
  let assumed = false;

  if (target === 'personal.dateOfBirth') {
    const formatted = formatDate(field, raw);
    value = formatted.value;
    if (formatted.note) notes.push(formatted.note);
    assumed = formatted.assumed;
  }

  if (target === 'contact.phone' && field.maxLength && value.length > field.maxLength) {
    const digits = value.replace(/\D/g, '');
    // Indian numbers are often stored with +91 or a leading 0.
    if (digits.length > field.maxLength && /^(91|0)/.test(digits)) {
      value = digits.slice(-field.maxLength);
      notes.push(`Country code removed so the number fits ${field.maxLength} digits.`);
    } else if (digits.length <= field.maxLength) {
      value = digits;
      notes.push('Spaces and symbols removed so the number fits.');
    }
  }

  if (field.maxLength && value.length > field.maxLength) return { ok: false, reason: 'too-long' };
  return { ok: true, value, displayValue: value, notes, assumed };
}

// ---------- Dates ----------

const DATE_PATTERN = /\b(dd|mm|yyyy|yy)([/\-. ])(dd|mm|yyyy|yy)\2(dd|mm|yyyy|yy)\b/i;

function formatDate(field: FormField, iso: string): { value: string; note?: string; assumed: boolean } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return { value: iso, assumed: false };
  const [, year, month, day] = match;

  // <input type="date"> always takes ISO, whatever it displays.
  if (field.type === 'date') return { value: iso, assumed: false };

  const hintText = [field.placeholder, field.label, field.surroundingText, field.title].filter(Boolean).join(' ');
  const format = DATE_PATTERN.exec(hintText);
  if (!format) {
    return {
      value: `${day}/${month}/${year}`,
      note: 'No date format shown; using DD/MM/YYYY.',
      assumed: true,
    };
  }

  const parts: Record<string, string> = { dd: day, mm: month, yyyy: year, yy: year.slice(2) };
  const separator = format[2];
  const value = [format[1], format[3], format[4]].map((part) => parts[part.toLowerCase()]).join(separator);
  return { value, note: `Date written as ${format[0].toUpperCase()}, as the field asks.`, assumed: false };
}

// ---------- Options (select / radio) ----------

const ALIASES: Record<string, string[]> = {
  male: ['m', 'man', 'boy'],
  female: ['f', 'woman', 'girl'],
  other: ['o', 'others', 'transgender', 'third gender', 'non binary'],
};

function canonical(text: string): string {
  for (const [key, aliases] of Object.entries(ALIASES)) {
    if (text === key || aliases.includes(text)) return key;
  }
  return text;
}

/** Placeholder entries like "Select state" or "-- choose --" are not answers. */
function isPlaceholderOption(option: FieldOption): boolean {
  return option.value === '' || /^(select|choose|pick|--)/i.test(option.text.trim());
}

/**
 * Finds the option that means the same as `raw`: exact text or value first,
 * then aliases ("M" = "Male"), then a prefix match ("Tamil Nadu" ≈ "Tamil Nadu (TN)").
 */
export function matchOption(options: FieldOption[], raw: string): FieldOption | undefined {
  const want = normalizeText(raw);
  if (!want) return undefined;
  const candidates = options.filter((option) => !isPlaceholderOption(option));
  const texts = (option: FieldOption) => [normalizeText(option.text), normalizeText(option.value)].filter(Boolean);

  return (
    candidates.find((option) => texts(option).includes(want)) ??
    candidates.find((option) => texts(option).some((text) => canonical(text) === canonical(want))) ??
    candidates.find((option) =>
      texts(option).some((text) => text.length >= 3 && want.length >= 3 && (text.startsWith(want) || want.startsWith(text))),
    )
  );
}
