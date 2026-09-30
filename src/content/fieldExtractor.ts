import type { FieldOption, FormField } from '../types/formField';
import { cleanText, truncate } from '../utils/text';
import { containsOtherControls, textWithoutControls, toDocumentLevelNode } from './domUtils';
import { getFieldLabel, getRadioGroupLabel, getRadioOptionText } from './labelDetector';

/** A single control, or all radios in one group. */
export type FieldElements = Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

/**
 * Builds the FormField description for one field.
 *
 * `own` is usually one element; for radio groups it's every radio in the
 * group. `headings` is the page's list of headings, collected once per scan
 * instead of once per field (a big saving on long forms).
 */
export function extractField(own: FieldElements, elementId: string, headings: Element[]): FormField {
  const primary = own[0];
  const isRadio = primary instanceof HTMLInputElement && primary.type === 'radio';

  const label = isRadio
    ? getRadioGroupLabel(own as HTMLInputElement[])
    : getFieldLabel(primary);

  // getAttribute returns null when missing; `|| undefined` also turns "" into
  // undefined so empty attributes don't show up as signals.
  const attr = (name: string) => primary.getAttribute(name)?.trim() || undefined;

  return {
    elementId,
    tagName: primary.tagName.toLowerCase() as FormField['tagName'],
    // `.type` is normalized by the browser: unknown input types become "text",
    // and selects report "select-one" or "select-multiple".
    type: primary instanceof HTMLTextAreaElement ? 'textarea' : primary.type,

    name: attr('name'),
    id: primary.id || undefined,

    label: label.text || undefined,
    labelSource: label.source,

    placeholder: attr('placeholder'),
    ariaLabel: attr('aria-label'),
    autocomplete: attr('autocomplete'),
    title: attr('title'),

    surroundingText: getSurroundingText(own, label.text),
    sectionHeading: getSectionHeading(own, headings),

    options: getOptions(own),

    required:
      own.some((el) => el.required || el.getAttribute('aria-required') === 'true') ||
      label.hasRequiredMarker,
    readOnly: 'readOnly' in primary && primary.readOnly,
    maxLength: 'maxLength' in primary && primary.maxLength > 0 ? primary.maxLength : undefined,

    sensitive: false, // set by the scanner after risk classification
    formIndex: primary.form ? Array.from(document.forms).indexOf(primary.form) : -1,
    ...getSubmitTarget(primary.form),
  };
}

/**
 * Where the form sends its data, reported only when it's worth a warning:
 * another website, or unencrypted http.
 *
 * We read the attribute rather than `form.action`: a field named "action"
 * inside the form replaces `form.action` with that element ("DOM
 * clobbering"), which a malicious page could use to hide the real target.
 */
function getSubmitTarget(form: HTMLFormElement | null): Pick<FormField, 'submitsTo' | 'submitsInsecurely'> {
  if (!form) return {};
  try {
    const target = new URL(form.getAttribute('action') || location.href, document.baseURI);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return {};
    return {
      submitsTo: target.hostname !== location.hostname ? target.hostname : undefined,
      submitsInsecurely: target.protocol === 'http:' && !isLocalHost(target.hostname) ? true : undefined,
    };
  } catch {
    return {};
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * Choices for selects and radio groups. These are the site's options
 * ("Male", "Female", "Tamil Nadu"...), not anything the user chose.
 * Capped at 200 so a country list can't bloat the message.
 */
function getOptions(own: FieldElements): FieldOption[] | undefined {
  const primary = own[0];

  if (primary instanceof HTMLSelectElement) {
    return Array.from(primary.options)
      .filter((option) => !option.disabled)
      .slice(0, 200)
      .map((option) => ({ value: option.value, text: cleanText(option.text) }));
  }

  if (primary instanceof HTMLInputElement && primary.type === 'radio') {
    return (own as HTMLInputElement[]).map((radio) => ({
      value: radio.value,
      text: getRadioOptionText(radio),
    }));
  }

  return undefined;
}

/**
 * Nearest heading ABOVE the field, used later for context
 * ("City" under "Permanent Address" ≠ "City" under "Current Address").
 *
 * 1. If the field sits in a <fieldset> that groups several fields,
 *    its <legend> is the section title.
 * 2. Otherwise, the last h1–h6 (or role="heading") that comes before
 *    the field in document order.
 */
function getSectionHeading(own: FieldElements, headings: Element[]): string | undefined {
  const primary = own[0];

  const fieldset = primary.closest('fieldset');
  const legend = fieldset?.querySelector(':scope > legend');
  if (fieldset && legend && containsOtherControls(fieldset, own)) {
    const text = textWithoutControls(legend);
    if (text) return truncate(text, 100);
  }

  // Fields inside shadow DOM are compared using their host element.
  const position = toDocumentLevelNode(primary);
  let nearest: Element | undefined;
  for (const heading of headings) {
    // compareDocumentPosition returns bit flags; FOLLOWING means
    // "`position` comes after `heading` in the document".
    if (heading.compareDocumentPosition(position) & Node.DOCUMENT_POSITION_FOLLOWING) {
      nearest = heading;
    } else {
      break; // headings are in document order, so the rest are all below
    }
  }

  const text = nearest ? cleanText(nearest.textContent) : '';
  return text ? truncate(text, 100) : undefined;
}

/** Elements that mark the edge of a page section. */
const SECTION_BOUNDARY = 'form, body, section, article, main, aside, fieldset, table, dialog';

/**
 * Text in the field's own little container, minus the label itself.
 * Captures hints like "(As per 10th certificate)" or "DD/MM/YYYY".
 */
function getSurroundingText(own: FieldElements, labelText: string): string | undefined {
  // Climb while the container still holds only this field.
  let container: Element = own[0];
  for (let depth = 0; depth < 3; depth++) {
    const parent = container.parentElement;
    if (!parent || parent.matches(SECTION_BOUNDARY) || containsOtherControls(parent, own)) break;
    // A container holding a heading, or lots of text, is a page section,
    // not the field's own wrapper. Its text would be noise, not a hint.
    if (parent.querySelector('h1, h2, h3, h4, h5, h6')) break;
    if (textWithoutControls(parent).length > 200) break;
    container = parent;
  }
  if (container === own[0]) return undefined;

  let text = textWithoutControls(container);
  if (labelText) text = cleanText(text.replace(labelText, ''));

  // For radio groups the option texts ("Male Female") aren't useful context.
  if (own.length > 1) {
    for (const radio of own) {
      text = text.replace(getRadioOptionText(radio as HTMLInputElement), '');
    }
    text = cleanText(text);
  }

  return text ? truncate(text, 150) : undefined;
}
