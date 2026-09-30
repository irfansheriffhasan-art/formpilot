import type { ExtensionMessage } from '../types/messages';

/**
 * Helpers for talking to the page the user is looking at.
 * Every popup feature that reads or fills a page goes through these.
 */

export async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab found.');
  return tab.id;
}

/**
 * Injects content.js into the tab. Safe to call repeatedly: the script's
 * own guard stops it from registering listeners twice.
 * Allowed by `activeTab` only after the user has clicked the FormPilot icon.
 */
export async function ensureContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

export async function sendToTab<Response>(tabId: number, message: ExtensionMessage): Promise<Response> {
  return (await chrome.tabs.sendMessage(tabId, message)) as Response;
}

/** Turns raw Chrome errors into instructions the user can act on. */
export function explainTabError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/cannot access|cannot be scripted|chrome:\/\/|extensions gallery/i.test(raw)) {
    return 'FormPilot can’t run on browser pages like chrome:// or the Web Store. Open a regular website and try again.';
  }
  if (/file:\/\//i.test(raw)) {
    return 'To scan local files, turn on “Allow access to file URLs” for FormPilot in chrome://extensions.';
  }
  if (/receiving end does not exist/i.test(raw)) {
    return 'The page didn’t answer. Reload the tab, then open FormPilot again.';
  }
  return raw;
}
