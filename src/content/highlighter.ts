import type { FormField } from '../types/formField';
import type { FieldElements } from './fieldExtractor';

/**
 * Draws an outline around detected fields so you can SEE what FormPilot
 * found. We change only the outline style, and remember the original value
 * so clearHighlights() can put the page back exactly as it was.
 */

const DETECTED_COLOR = '#0b8a88';
const SENSITIVE_COLOR = '#d08700';
const FILLED_COLOR = '#2e8540';

interface SavedStyle {
  outline: string;
  outlinePriority: string;
  offset: string;
  offsetPriority: string;
}

const saved = new Map<HTMLElement, SavedStyle>();

/** `filledIds`: fields FormPilot has filled, drawn in green. */
export function highlightFields(
  fields: FormField[],
  elements: Map<string, FieldElements>,
  filledIds: ReadonlySet<string> = new Set(),
): void {
  clearHighlights();

  for (const field of fields) {
    for (const element of elements.get(field.elementId) ?? []) {
      const { style } = element;
      saved.set(element, {
        outline: style.getPropertyValue('outline'),
        outlinePriority: style.getPropertyPriority('outline'),
        offset: style.getPropertyValue('outline-offset'),
        offsetPriority: style.getPropertyPriority('outline-offset'),
      });
      // "important" so site styles like `outline: none !important` can't hide it.
      const color = filledIds.has(field.elementId) ? FILLED_COLOR : field.sensitive ? SENSITIVE_COLOR : DETECTED_COLOR;
      style.setProperty('outline', `2px solid ${color}`, 'important');
      style.setProperty('outline-offset', '2px', 'important');
    }
  }
}

export function clearHighlights(): void {
  for (const [element, original] of saved) {
    element.style.setProperty('outline', original.outline, original.outlinePriority);
    element.style.setProperty('outline-offset', original.offset, original.offsetPriority);
  }
  saved.clear();
}
