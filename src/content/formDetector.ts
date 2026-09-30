import { classifyFieldRisk } from '../intelligence/sensitivity';
import type { FormField, PageScanResult, SkipReason } from '../types/formField';
import { CONTROL_SELECTOR, isControlVisible, toDocumentLevelNode } from './domUtils';
import { extractField, type FieldElements } from './fieldExtractor';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface ScanOutput {
  /** Sent to the popup: plain JSON, no DOM references, no values. */
  result: PageScanResult;
  /** Kept inside the content script: elementId → real DOM element(s). */
  elements: Map<string, FieldElements>;
}

/**
 * Input types that are never profile data. Anything not listed here
 * (text, email, tel, date, number, url, radio...) is a candidate.
 */
const SKIPPED_INPUT_TYPES: Record<string, SkipReason> = {
  hidden: 'hidden',
  password: 'password',
  checkbox: 'checkbox', // usually consent boxes: must be the user's own click
  submit: 'not-profile-data',
  reset: 'not-profile-data',
  button: 'not-profile-data',
  image: 'not-profile-data',
  file: 'not-profile-data',
  search: 'not-profile-data',
  range: 'not-profile-data',
  color: 'not-profile-data',
};

/**
 * Each element keeps its id across scans, so when the page changes and we
 * scan again, the popup can keep the user's choices for fields it already
 * knows. A WeakMap doesn't keep removed elements alive in memory.
 */
const knownIds = new WeakMap<Element, string>();
let nextId = 1;

function idFor(element: Element): string {
  let id = knownIds.get(element);
  if (!id) {
    id = `fp-${nextId++}`;
    knownIds.set(element, id);
  }
  return id;
}

/**
 * Scans the whole page and returns every fillable field.
 *
 * Pipeline: collect → skip obvious non-fields → group radios →
 *           extract metadata → classify risk → register.
 * One broken field is counted as an error and skipped; it never stops the scan.
 */
export function scanPage(): ScanOutput {
  const skipped: Partial<Record<SkipReason, number>> = {};
  const countSkip = (reason: SkipReason) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  // --- 1. Collect and filter, grouping radio buttons as we go ---
  const groups: FieldElements[] = [];
  const radioGroups = new Map<string, HTMLInputElement[]>();

  for (const control of sortByPageOrder(collectControls(document))) {
    const reason = getSkipReason(control);
    if (reason) {
      countSkip(reason);
      continue;
    }

    if (control instanceof HTMLInputElement && control.type === 'radio' && control.name) {
      // Radios with the same name in the same form are one question.
      const formKey = control.form ? Array.from(document.forms).indexOf(control.form) : -1;
      const key = `${formKey}|${control.name}`;
      const existing = radioGroups.get(key);
      if (existing) {
        existing.push(control);
      } else {
        const group = [control];
        radioGroups.set(key, group);
        groups.push(group); // pushed once, in page order; later radios join it
      }
      continue;
    }

    groups.push([control]);
  }

  // --- 2. Extract metadata and classify risk ---
  // Collected once per scan instead of once per field.
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'));
  const fields: FormField[] = [];
  const elements = new Map<string, FieldElements>();

  for (const own of groups) {
    try {
      const field = extractField(own, '', headings);

      const risk = classifyFieldRisk(field);
      if (risk === 'blocked-password') { countSkip('password'); continue; }
      if (risk === 'blocked-payment') { countSkip('payment'); continue; }
      if (risk === 'blocked-otp') { countSkip('otp-captcha'); continue; }
      field.sensitive = risk === 'sensitive';

      // Only fields that passed the risk check get an id.
      field.elementId = idFor(own[0]);
      fields.push(field);
      elements.set(field.elementId, own);
    } catch {
      // No error details: they could include page content.
      countSkip('error');
    }
  }

  return {
    result: {
      hostname: location.hostname,
      fields,
      skipped,
      iframeCount: document.querySelectorAll('iframe, frame').length,
      secureContext: window.isSecureContext,
    },
    elements,
  };
}

/**
 * Finds all inputs, selects and textareas, including inside OPEN shadow
 * roots (web components). document.querySelectorAll can't see inside
 * shadow DOM, so we visit each shadow root ourselves.
 * Closed shadow roots are private by design; no extension can read them.
 */
function collectControls(root: Document | ShadowRoot): Control[] {
  const found = Array.from(root.querySelectorAll<Control>(CONTROL_SELECTOR));
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot) {
      found.push(...collectControls(element.shadowRoot));
    }
  }
  return found;
}

/**
 * collectControls lists shadow-DOM controls after all regular ones. Sorting
 * by position (using each shadow control's host) restores top-to-bottom
 * page order, so the popup lists fields in the order the user sees them.
 */
function sortByPageOrder(controls: Control[]): Control[] {
  return [...controls].sort((a, b) => {
    const nodeA = toDocumentLevelNode(a);
    const nodeB = toDocumentLevelNode(b);
    if (nodeA === nodeB) return 0; // same host: keep collection order
    return nodeA.compareDocumentPosition(nodeB) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
}

/** Returns why a control should be skipped, or null if it's a candidate. */
function getSkipReason(control: Control): SkipReason | null {
  if (control instanceof HTMLInputElement) {
    const reason = SKIPPED_INPUT_TYPES[control.type];
    if (reason) return reason;
  }

  if (control.disabled) return 'disabled';

  return isControlVisible(control) ? null : 'hidden';
}
