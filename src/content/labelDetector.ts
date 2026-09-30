import type { LabelSource } from '../types/formField';
import { cleanText, humanizeIdentifier, isMeaningfulIdentifier } from '../utils/text';
import { containsOtherControls, textWithoutControls } from './domUtils';

/**
 * Finds the human-readable label for a form field.
 *
 * Why so many strategies? Because websites label fields in wildly different
 * ways. A well-built site uses <label for="...">. Others wrap the input in
 * a <label>, use ARIA attributes, put the text in a neighbouring table cell,
 * rely on a placeholder, or give you nothing but name="applicant_name".
 * We try each strategy in order of reliability and stop at the first hit,
 * recording WHICH strategy worked so later phases can weigh it.
 */

export interface LabelResult {
  text: string;
  source: LabelSource;
  /** The label had a "*" marker, which usually means "required". */
  hasRequiredMarker: boolean;
}

/** Labels longer than this are almost certainly paragraphs, not labels. */
const MAX_LABEL_LENGTH = 80;

type LabelableElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function getFieldLabel(element: LabelableElement): LabelResult {
  const strategies: Array<[LabelSource, () => string]> = [
    ['label', () => fromLabelElements(element)],
    ['aria-labelledby', () => fromAriaLabelledBy(element)],
    ['aria-label', () => cleanText(element.getAttribute('aria-label'))],
    ['nearby-text', () => getNearbyText(element, [element])],
    ['title', () => cleanText(element.getAttribute('title'))],
    ['placeholder', () => cleanText(element.getAttribute('placeholder'))],
    ['name', () => fromIdentifier(element.getAttribute('name'))],
    ['id', () => fromIdentifier(element.id)],
  ];

  for (const [source, strategy] of strategies) {
    const text = strategy();
    if (text) {
      return { text, source, hasRequiredMarker: hasRequiredMarker(element, source) };
    }
  }
  return { text: '', source: 'none', hasRequiredMarker: false };
}

/**
 * Label for a radio group (e.g. Gender: ○ Male ○ Female).
 * Each radio's own <label> is the OPTION text ("Male"), so the group's
 * label must come from the container: a <legend>, a role="radiogroup"
 * label, or the text just before the whole group.
 */
export function getRadioGroupLabel(radios: HTMLInputElement[]): LabelResult {
  const first = radios[0];

  const fieldset = first.closest('fieldset');
  const legend = fieldset?.querySelector(':scope > legend');
  // Only use the legend if this fieldset wraps just this group; otherwise
  // it's a section title like "Personal Details", not the group's label.
  if (fieldset && legend && !containsOtherControls(fieldset, radios)) {
    const text = textWithoutControls(legend);
    if (text) return { text, source: 'label', hasRequiredMarker: /\*/.test(legend.textContent ?? '') };
  }

  const group = first.closest('[role="radiogroup"]');
  if (group) {
    const text = fromAriaLabelledBy(group) || cleanText(group.getAttribute('aria-label'));
    if (text) return { text, source: 'aria-label', hasRequiredMarker: false };
  }

  const text = getNearbyText(commonAncestor(radios), radios);
  if (text) return { text, source: 'nearby-text', hasRequiredMarker: false };

  // Pattern: <div><span>Category</span> ○ General ○ OBC</div>
  // The group's label sits INSIDE the shared container, just before the
  // first radio. Ignore it if it's actually one of the option texts.
  const optionTexts = radios.map(getRadioOptionText);
  const beforeFirst = getNearbyText(first, radios);
  if (beforeFirst && !optionTexts.includes(beforeFirst)) {
    return { text: beforeFirst, source: 'nearby-text', hasRequiredMarker: false };
  }

  const fromName = fromIdentifier(first.name);
  return fromName
    ? { text: fromName, source: 'name', hasRequiredMarker: false }
    : { text: '', source: 'none', hasRequiredMarker: false };
}

/** The visible text for one radio option, e.g. "Male". */
export function getRadioOptionText(radio: HTMLInputElement): string {
  const fromLabel = fromLabelElements(radio);
  if (fromLabel) return fromLabel;
  // Pattern: <input type="radio"> Male   (text right after the input)
  const next = radio.nextSibling;
  const nextText = next ? cleanText(next.textContent) : '';
  return nextText && nextText.length <= MAX_LABEL_LENGTH ? nextText : radio.value;
}

// ---------- Strategy 1: <label> elements ----------

/**
 * `element.labels` is a built-in browser API that returns BOTH kinds:
 *   <label for="email">Email</label> <input id="email">
 *   <label>Email <input></label>
 * We read each label's text without the controls inside it.
 */
function fromLabelElements(element: LabelableElement): string {
  const labels = Array.from(element.labels ?? []);
  return cleanText(labels.map((label) => textWithoutControls(label)).join(' '));
}

// ---------- Strategy 2: aria-labelledby ----------

/**
 * aria-labelledby="id1 id2" means "my label is the text of #id1 and #id2".
 * getRootNode() makes the lookup work inside shadow DOM as well.
 */
function fromAriaLabelledBy(element: Element): string {
  const ids = element.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) ?? [];
  const root = element.getRootNode() as Document | ShadowRoot;
  const texts = ids.map((id) => {
    const target = root.getElementById(id);
    return target ? cleanText(target.textContent) : '';
  });
  return cleanText(texts.join(' '));
}

// ---------- Strategy 4: nearby text ----------

/**
 * Looks for visible text just BEFORE the field, climbing outward.
 *
 * Handles layouts such as:
 *   <label>Email</label> <input>                 (label without for=)
 *   <div>Email</div> <div><input></div>          (sibling wrappers)
 *   <td>Email</td> <td><input></td>              (table rows)
 *   Email: <input>                               (bare text)
 *
 * The safety rule: if we meet a container holding ANOTHER field, we stop,
 * because any text beyond it belongs to that other field.
 */
export function getNearbyText(start: Element, own: Element[]): string {
  // Grid tables have real column headers; those describe the field better
  // than the row's first cell, so check them before anything else.
  const gridLabel = fromTableHeader(start);
  if (gridLabel) return gridLabel;

  let node: Element = start;

  for (let depth = 0; depth < 4; depth++) {
    let candidate = '';

    for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) {
      if (sibling.nodeType === Node.TEXT_NODE) {
        candidate ||= cleanText(sibling.textContent);
        continue;
      }
      if (!(sibling instanceof Element)) continue;
      if (containsOtherControls(sibling, own)) break;

      const text = textWithoutControls(sibling);
      // A <label> sibling beats helper text like "We'll never share this",
      // so return it immediately even if we saw other text first.
      if (sibling.tagName === 'LABEL' && text) return acceptable(text);
      candidate ||= text;
    }

    if (candidate) return acceptable(candidate);

    const parent = node.parentElement;
    if (!parent || parent.matches('form, body') || containsOtherControls(parent, own)) break;
    node = parent;
  }

  return '';
}

/**
 * For grid-style tables where labels are column headers:
 *
 *   <tr><th>Qualification</th><th>Board</th><th>Year</th></tr>
 *   <tr><td>SSLC</td>        <td><input></td><td><input></td></tr>
 *
 * The column header says WHAT the field is ("Year"); the row's first cell
 * says WHICH one ("SSLC"). We combine them: "Year (SSLC)".
 *
 * Only applies when the table has a real header row (<thead> or a row made
 * of <th> cells). Simple two-column label/input tables have none.
 */
function fromTableHeader(element: Element): string {
  const cell = element.closest('td');
  const row = cell?.parentElement;
  const table = cell?.closest('table');
  if (!cell || !row || !table) return '';

  const headerRow =
    table.querySelector('thead tr') ??
    Array.from(table.querySelectorAll('tr')).find(
      (tr) => tr.children.length > 0 && Array.from(tr.children).every((c) => c.tagName === 'TH'),
    );
  if (!headerRow || headerRow === row) return '';

  const columnIndex = Array.from(row.children).indexOf(cell);
  const header = headerRow.children[columnIndex];
  const headerText = header ? textWithoutControls(header) : '';
  if (!headerText) return '';

  const firstCell = row.children[0];
  const rowLabel =
    firstCell && firstCell !== cell && !firstCell.querySelector('input, select, textarea')
      ? textWithoutControls(firstCell)
      : '';

  return acceptable(rowLabel ? `${headerText} (${rowLabel})` : headerText);
}

// ---------- Strategies 7–8: name and id ----------

/** "candidate_legal_name" → "candidate legal name"; "input-12" → "" */
function fromIdentifier(identifier: string | null): string {
  if (!identifier) return '';
  const humanized = humanizeIdentifier(identifier);
  return isMeaningfulIdentifier(humanized) ? humanized : '';
}

// ---------- Helpers ----------

function acceptable(text: string): string {
  return text.length <= MAX_LABEL_LENGTH ? text : '';
}

function hasRequiredMarker(element: LabelableElement, source: LabelSource): boolean {
  if (source !== 'label') return false;
  return Array.from(element.labels ?? []).some((label) => /\*/.test(label.textContent ?? ''));
}

/** The smallest element that contains every element in the list. */
function commonAncestor(elements: Element[]): Element {
  let ancestor: Element = elements[0];
  while (ancestor.parentElement && !elements.every((el) => ancestor.contains(el))) {
    ancestor = ancestor.parentElement;
  }
  return ancestor;
}
