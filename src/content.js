/**
 * Content script — runs in every page at document_idle.
 *
 * Lightweight role: expose a small "workspace" bridge on the page so
 * injected scripts can ask the extension for the current snapshot, and
 * surface a subtle badge hint when the user is on a tracked tab.
 */

(function () {
  "use strict";

  // Expose a minimal bridge for pages that opt in via the injected script.
  window.__WorkspaceLauncher = {
    version: "1.0.0",
    async snapshot() {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "snapshot" }, (resp) => {
          resolve(resp && resp.ok ? resp.payload : null);
        });
      });
    },
  };

  // Optional: inject a tiny "capture" button into the page for power users.
  // Disabled by default to avoid clutter; toggle in options if desired.
})();