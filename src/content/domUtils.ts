import { cleanText } from '../utils/text';

/** Every element that can hold form data. */
export const CONTROL_SELECTOR = 'input, select, textarea';

/**
 * The visible text of an element, ignoring any form controls inside it.
 *
 * Why not just `element.textContent`? A wrapping label like
 *   <label>State <select><option>Kerala</option>...</select></label>
 * would give "State Kerala Tamil Nadu ...". We copy the element, delete the
 * controls from the copy, and read the text of what's left.
 */
export function textWithoutControls(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy
    .querySelectorAll(`${CONTROL_SELECTOR}, button, script, style, [aria-hidden="true"]`)
    .forEach((node) => node.remove());
  return cleanText(copy.textContent);
}

/**
 * True if `container` holds a form control that is NOT one of `own`.
 *
 * This is how we tell "text near this field" from "text that belongs to a
 * different field": once a container holds another field's control, its
 * text can't be trusted as our label.
 */
export function containsOtherControls(container: Element, own: Element[]): boolean {
  if (container.matches(CONTROL_SELECTOR) && !own.includes(container)) return true;
  for (const control of container.querySelectorAll(CONTROL_SELECTOR)) {
    if (!own.includes(control)) return true;
  }
  return false;
}

/**
 * True if a person could actually see this control. Checked at scan time
 * AND again right before filling, because a page can hide a field after
 * the scan.
 *
 * This is a security check, not just tidiness. A malicious page can add
 * fields you can't see ("honeypots" or harvesting fields) labelled "Phone"
 * or "Address", hoping an autofill tool fills them along with the one field
 * you meant to give. Hidden fields never get filled.
 */
export function isControlVisible(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
  if (isVisible(control)) return true;
  // Custom-styled radios often hide the real input and show a styled
  // <label> instead. If the label is visible, the choice is visible.
  return (
    control instanceof HTMLInputElement &&
    control.type === 'radio' &&
    Array.from(control.labels ?? []).some(isVisible)
  );
}

/** Smaller than this (in CSS pixels) is not a field anyone can use. */
const MIN_VISIBLE_SIZE = 4;

function isVisible(element: HTMLElement): boolean {
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;

  // checkVisibility (Chrome 105+) accounts for display:none on ANY ancestor,
  // visibility:hidden and opacity:0, which are hard to check by hand.
  if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width < MIN_VISIBLE_SIZE || rect.height < MIN_VISIBLE_SIZE) return false;

  // Positioned entirely above or left of the page, e.g. left: -9999px.
  if (rect.right + window.scrollX < 0 || rect.bottom + window.scrollY < 0) return false;

  // Pushed off the right edge of a page that can't scroll sideways.
  const root = document.documentElement;
  if (rect.left >= root.clientWidth && root.scrollWidth <= root.clientWidth) return false;

  // Cut away with clip / clip-path (the "visually hidden" CSS trick).
  const style = getComputedStyle(element);
  if (style.clipPath !== 'none') return false;
  if (style.clip !== 'auto' && (style.position === 'absolute' || style.position === 'fixed')) return false;

  return !isClippedByAncestor(element, rect);
}

/**
 * Catches a common hiding trick that checkVisibility misses: a wrapper with
 * `height: 0; overflow: hidden` (or one scrolled/positioned so the field
 * falls outside it). The field itself looks normal; its container cuts it off.
 */
function isClippedByAncestor(element: HTMLElement, rect: DOMRect): boolean {
  let node: Element | null = parentOf(element);
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      const box = node.getBoundingClientRect();
      const overlapWidth = Math.min(rect.right, box.right) - Math.max(rect.left, box.left);
      const overlapHeight = Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top);
      // hidden/clip really cut content off. auto/scroll don't: the user can
      // scroll to the field (long forms in modals), unless the box is ~0 size.
      const cuts = (value: string) => value === 'hidden' || value === 'clip';
      if (cuts(style.overflowX) && overlapWidth < MIN_VISIBLE_SIZE) return true;
      if (cuts(style.overflowY) && overlapHeight < MIN_VISIBLE_SIZE) return true;
      if (box.width < MIN_VISIBLE_SIZE || box.height < MIN_VISIBLE_SIZE) return true;
    }
    node = parentOf(node);
  }
  return false;
}

/** The parent element, stepping out of shadow roots to their host. */
function parentOf(node: Element): Element | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/**
 * For an element inside shadow DOM, returns the outermost shadow host that
 * lives in the main document. Document-order comparisons (like "which
 * heading comes before this field?") only work between nodes in the same tree.
 */
export function toDocumentLevelNode(element: Element): Element {
  let node: Element = element;
  let root = node.getRootNode();
  while (root instanceof ShadowRoot) {
    node = root.host;
    root = node.getRootNode();
  }
  return node;
}
