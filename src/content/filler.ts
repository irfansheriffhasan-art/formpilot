import type { FormField } from '../types/formField';
import type { FillStatus } from '../types/messages';
import { isControlVisible } from './domUtils';
import type { FieldElements } from './fieldExtractor';

/**
 * The filling engine: puts one approved value into one field, the way a
 * person typing would, so the site's own code notices.
 *
 * It never submits forms, never touches checkboxes (they aren't in the
 * element map), and never reads what's already in a field.
 */
export function fillField(field: FormField, elements: FieldElements, value: string): FillStatus {
  const primary = elements[0];
  if (!primary || !primary.isConnected) return 'not-found';
  if (primary.disabled || ('readOnly' in primary && primary.readOnly)) return 'read-only';
  // Re-checked now, not trusted from the scan: a page can hide a field
  // after the user reviewed the list, hoping it gets filled anyway.
  if (field.type !== 'radio' && !isControlVisible(primary)) return 'not-visible';

  if (field.type === 'radio') return fillRadio(elements as HTMLInputElement[], value);

  if (primary instanceof HTMLSelectElement) {
    if (!Array.from(primary.options).some((option) => option.value === value)) return 'no-option';
    setNativeValue(primary, value);
    dispatchChangeEvents(primary);
    return 'filled';
  }

  setNativeValue(primary, value);
  dispatchChangeEvents(primary);
  return 'filled';
}

/**
 * Sets `.value` through the browser's built-in setter.
 *
 * Why not just `element.value = value`? React (and similar frameworks)
 * replace the value property on each input to track changes. Assigning
 * through that replacement updates React's record too, so when our "input"
 * event arrives React thinks nothing changed and ignores it: the form looks
 * filled but submits empty. The prototype's original setter bypasses that
 * tracking, so the event is seen as a real change.
 */
function setNativeValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
}

/**
 * The events a real edit produces. Frameworks listen to different ones:
 * React and Vue to "input", many plain sites to "change", and validation
 * scripts often run on "blur". Without these the site's JavaScript never
 * learns the field changed.
 */
function dispatchChangeEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('blur'));
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

/**
 * Radios are chosen with click(): the browser then checks the radio,
 * unchecks its siblings and fires click/input/change itself, exactly as for
 * a real click. (Checkboxes never reach this code.)
 */
function fillRadio(radios: HTMLInputElement[], value: string): FillStatus {
  const radio = radios.find((r) => r.value === value);
  if (!radio) return 'no-option';
  if (!isControlVisible(radio)) return 'not-visible';
  if (!radio.checked) radio.click();
  return radio.checked ? 'filled' : 'error';
}
