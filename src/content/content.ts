import {
  POPUP_PORT_NAME,
  type ExtensionMessage,
  type FillFieldsResponse,
  type FillStatus,
  type FillItem,
  type PortMessage,
  type ScanPageResponse,
} from '../types/messages';
import { fillField } from './filler';
import { scanPage, type ScanOutput } from './formDetector';
import { clearHighlights, highlightFields } from './highlighter';
import { watchPage } from './pageWatcher';

/**
 * FormPilot content script: the entry point injected into the page.
 *
 * It only routes messages. The real work happens in formDetector.ts
 * (scanning), filler.ts (filling) and pageWatcher.ts (watching for changes).
 */

declare global {
  interface Window {
    __formPilotLoaded?: boolean;
  }
}

// The popup injects this script each time it scans. The guard makes sure
// listeners are registered only once per page.
if (!window.__formPilotLoaded) {
  window.__formPilotLoaded = true;

  // The latest scan, including the elementId → element map. It lives only
  // in this isolated world; the page's own scripts can't see it.
  let lastScan: ScanOutput | null = null;
  let highlightOn = false;
  const filledIds = new Set<string>();

  // The open popup's connection, and the watcher that runs while it's open.
  let popupPort: chrome.runtime.Port | null = null;
  let stopWatching: (() => void) | null = null;

  function redrawHighlights() {
    if (highlightOn && lastScan) highlightFields(lastScan.result.fields, lastScan.elements, filledIds);
    else clearHighlights();
  }

  /** Re-scans after the page changed; tells the popup only if the fields changed. */
  function handlePageChange() {
    if (!lastScan || !popupPort) return;
    const idsBefore = lastScan.result.fields.map((f) => f.elementId).join(',');
    try {
      const next = scanPage();
      if (next.result.fields.map((f) => f.elementId).join(',') === idsBefore) return;
      lastScan = next;
      redrawHighlights();
      popupPort.postMessage({ type: 'FIELDS_CHANGED', result: next.result } satisfies PortMessage);
    } catch {
      // Keep the previous scan; the user can still press "Scan again".
    }
  }

  function fillAll(items: FillItem[]): FillFieldsResponse {
    if (!lastScan) return { ok: false, error: 'Scan the page before filling.' };
    const results = items.map((item) => {
      const field = lastScan!.result.fields.find((f) => f.elementId === item.elementId);
      const elements = lastScan!.elements.get(item.elementId);
      let status: FillStatus;
      if (!field || !elements) {
        // Blocked fields never got an id, so they always end up here.
        status = 'not-allowed';
      } else if (field.sensitive && !item.confirmedSensitive) {
        status = 'needs-confirmation';
      } else {
        try {
          status = fillField(field, elements, item.value);
        } catch {
          status = 'error';
        }
      }
      if (status === 'filled') filledIds.add(item.elementId);
      return { elementId: item.elementId, status };
    });
    redrawHighlights();
    return { ok: true, results };
  }

  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      switch (message.type) {
        case 'SCAN_PAGE': {
          clearHighlights();
          try {
            lastScan = scanPage();
            sendResponse({ ok: true, result: lastScan.result } satisfies ScanPageResponse);
            if (popupPort && !stopWatching) stopWatching = watchPage(handlePageChange);
          } catch {
            lastScan = null;
            sendResponse({
              ok: false,
              error: 'FormPilot couldn’t read the fields on this page.',
            } satisfies ScanPageResponse);
          }
          break;
        }

        case 'SET_HIGHLIGHT': {
          highlightOn = message.enabled;
          redrawHighlights();
          sendResponse({ ok: true });
          break;
        }

        case 'FILL_FIELDS': {
          sendResponse(fillAll(message.items));
          break;
        }
      }
    },
  );

  // When the popup closes, its port disconnects: stop watching and tidy up.
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== POPUP_PORT_NAME) return;
    popupPort = port;
    if (lastScan && !stopWatching) stopWatching = watchPage(handlePageChange);

    port.onDisconnect.addListener(() => {
      if (popupPort === port) popupPort = null;
      stopWatching?.();
      stopWatching = null;
      highlightOn = false;
      clearHighlights();
    });
  });
}
