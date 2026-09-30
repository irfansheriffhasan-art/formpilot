import type { PageScanResult } from './formField';

/**
 * Message contracts between FormPilot's components.
 *
 * Every message has a `type` field. TypeScript uses it to narrow the union:
 * inside `case 'SCAN_PAGE':`, it knows exactly which message shape you hold.
 * This pattern is called a "discriminated union".
 *
 * Messages must be plain JSON. DOM elements and functions can't be sent.
 */
export type ExtensionMessage =
  | { type: 'PING_BACKGROUND' }
  | { type: 'SCAN_PAGE' }
  | { type: 'SET_HIGHLIGHT'; enabled: boolean }
  | { type: 'FILL_FIELDS'; items: FillItem[] };

/**
 * One approved fill. Profile values cross into the page ONLY through this,
 * and only after the user clicks Fill in the popup.
 */
export interface FillItem {
  elementId: string;
  value: string;
  /** Must be true for sensitive fields; the content script re-checks. */
  confirmedSensitive: boolean;
}

export type FillStatus =
  | 'filled'
  | 'not-found'          // the element left the page since the scan
  | 'not-allowed'        // unknown id: blocked fields never get one
  | 'needs-confirmation' // sensitive field without confirmation
  | 'not-visible'        // hidden since the scan: never filled
  | 'read-only'
  | 'no-option'          // select/radio has no option with that value
  | 'error';

/** Reply to FILL_FIELDS. Statuses only: values never travel back. */
export type FillFieldsResponse =
  | { ok: true; results: Array<{ elementId: string; status: FillStatus }> }
  | { ok: false; error: string };

/** Pushed from the content script to the popup over the port. */
export type PortMessage = { type: 'FIELDS_CHANGED'; result: PageScanResult };

/** Reply from the service worker to PING_BACKGROUND. */
export interface BackgroundPingResponse {
  ok: true;
  version: string;
}

/** Reply from the content script to SCAN_PAGE. */
export type ScanPageResponse =
  | { ok: true; result: PageScanResult }
  | { ok: false; error: string };

/**
 * Name of the long-lived connection the popup opens to the content script.
 * When the popup closes, the connection drops, and the content script uses
 * that as the signal to remove its highlights from the page.
 */
export const POPUP_PORT_NAME = 'formpilot-popup';
