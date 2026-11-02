/**
 * Injected script — runs in the page's MAIN world (not the isolated world),
 * so it can see page globals. Web-accessible so it loads on any page.
 *
 * Purpose: give power users a hook to capture the current page's context
 * (e.g. scroll position, open popups, form state) into a workspace.
 * Everything here is read-only and safe by default.
 */
(function () {
  "use strict";

  const SENSITIVE_RE = /password|cc-|cc_|credit.?card|ssn|social.?security|pin|cvv|cvc/i;

  /** Read-only snapshot of the page's observable state. */
  function snapshot() {
    const sel = (sel) => {
      try {
        const el = document.querySelector(sel);
        return el ? el.textContent.trim().slice(0, 200) : null;
      } catch {
        return null;
      }
    };

    return {
      url: location.href,
      title: document.title,
      scroll: { x: window.scrollX, y: window.scrollY },
      ref: sel("[data-workspace-ref]"),
      timestamp: Date.now(),
    };
  }

  /**
   * Capture form field values from the page.
   * Skips password/hidden fields and anything marked as a payment field.
   * Returns { nameOrId -> value } (checkboxes become arrays).
   */
  function captureFormState() {
    const data = {};
    document.querySelectorAll("input, textarea, select").forEach((el) => {
      // Skip sensitive / non-serializable field types
      if (el.type === "password" || el.type === "hidden") return;
      if (el.type === "submit" || el.type === "button" || el.type === "image") return;
      if (el.type === "file") return;
      // Skip fields the page marks as autocomplete-sensitive
      if (el.autocomplete && SENSITIVE_RE.test(el.autocomplete)) return;

      const key = el.name || el.id;
      if (!key) return;

      if (el.type === "checkbox") {
        if (el.checked) {
          if (!Array.isArray(data[key])) data[key] = [];
          data[key].push(el.value);
        }
      } else if (el.type === "radio") {
        if (el.checked) data[key] = el.value;
      } else {
        data[key] = el.value;
      }
    });
    return data;
  }

  /**
   * Restore form field values captured by captureFormState().
   * Dispatches input/change events so JS frameworks pick up the new values.
   */
  function restoreFormState(state) {
    if (!state || typeof state !== "object") return;
    Object.keys(state).forEach((key) => {
      const value = state[key];
      // Try name first, then id — the same key used at capture time.
      const el =
        document.querySelector('[name="' + key.replace(/"/g, "\\'") + '"]') ||
        document.getElementById(key);
      if (!el) return;

      if (el.type === "checkbox") {
        el.checked = Array.isArray(value) ? value.includes(el.value) : !!value;
      } else if (el.type === "radio") {
        el.checked = el.value === value;
      } else {
        el.value = value;
      }
      // Fire both events so React/Vue/Angular pick it up.
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  const API = {
    version: "1.0.6",
    snapshot,
    captureFormState,
    restoreFormState,
    /** Expose the bridge to the content script's world. */
    bridge() {
      return typeof window.__WorkspaceLauncher !== "undefined"
        ? window.__WorkspaceLauncher
        : null;
    },
  };

  // Don't clobber an existing definition.
  if (typeof window.__WorkspaceInjected === "undefined") {
    window.__WorkspaceInjected = API;
  }
})();