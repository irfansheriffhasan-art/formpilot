import type { BackgroundPingResponse, ExtensionMessage } from '../types/messages';

/**
 * FormPilot background service worker.
 *
 * Chrome starts this worker when an event arrives and stops it after it has
 * been idle for a short while. Global variables here are NOT reliable state:
 * they disappear whenever the worker is stopped. Persistent data belongs in
 * chrome.storage (Phase 2).
 */

// The unlocked vault key lives in chrome.storage.session. Only extension
// pages and this worker may read it, never content scripts running inside
// websites. That's Chrome's default; we set it explicitly so a future
// change elsewhere can't silently widen access.
void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

// Runs once when the extension is installed or updated.
// Safe to log: this contains no personal information.
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[FormPilot] Installed (reason: ${details.reason})`);
});

/**
 * Central message listener.
 *
 * Listeners must be registered at the top level of the file, synchronously.
 * If you register them inside a setTimeout or after an await, Chrome may wake
 * the worker for a message before the listener exists, and the message is lost.
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'PING_BACKGROUND': {
        const response: BackgroundPingResponse = {
          ok: true,
          version: chrome.runtime.getManifest().version,
        };
        sendResponse(response);
        break;
      }
      default:
        // Messages meant for other components (e.g. PING_CONTENT) are ignored.
        break;
    }
    // Returning nothing (undefined) tells Chrome we replied synchronously.
    // Later, for async work, we'll `return true` to keep the channel open.
  },
);
