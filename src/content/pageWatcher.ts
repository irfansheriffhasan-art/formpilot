import { CONTROL_SELECTOR } from './domUtils';

/** Wait for the page to settle: one burst of changes → one re-scan. */
const DEBOUNCE_MS = 500;

/**
 * Watches the page for fields that appear, disappear, or become visible
 * after the scan: multi-step forms, "Add another" buttons, sections
 * revealed by a choice. Runs only while the popup is open.
 *
 * Returns a function that stops watching.
 */
export function watchPage(onChange: () => void): () => void {
  let timer: number | undefined;

  const observer = new MutationObserver((mutations) => {
    if (!mutations.some(isRelevant)) return;
    // "Debounce": every relevant change restarts the timer, so a page that
    // changes 50 times in a row is re-scanned once, after it goes quiet.
    window.clearTimeout(timer);
    timer = window.setTimeout(onChange, DEBOUNCE_MS);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    // Attributes that commonly show, hide, or enable parts of a form.
    attributeFilter: ['hidden', 'class', 'style', 'disabled', 'aria-hidden'],
  });

  return () => {
    observer.disconnect();
    window.clearTimeout(timer);
  };
}

function isRelevant(mutation: MutationRecord): boolean {
  if (mutation.type === 'attributes') {
    // Our own highlights change the `style` of controls. Ignoring those
    // stops FormPilot from endlessly re-scanning because of itself.
    const target = mutation.target as Element;
    return !(mutation.attributeName === 'style' && target.matches(CONTROL_SELECTOR));
  }
  return [...mutation.addedNodes, ...mutation.removedNodes].some(
    (node) => node instanceof Element && (node.matches(CONTROL_SELECTOR) || node.querySelector(CONTROL_SELECTOR) !== null),
  );
}
