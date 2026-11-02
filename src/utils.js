/**
 * Shared helpers used across the extension background, popup, and tests.
 * Pure, dependency-free, and deterministic so they are trivially unit-testable.
 */

/** Generate a short, URL-safe unique id (time-based + random). */
export function generateId() {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rnd}`;
}

/** Strip a URL down to its origin for display/comparison. */
export function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Extract a readable hostname from a URL. */
export function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Decide whether a tab URL is "restorable".
 * chrome://, edge://, chrome-extension://, and about: pages cannot be
 * reopened through chrome.tabs.create, so we skip them during capture/restore.
 */
export function isRestorableUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return !["chrome:", "edge:", "about:", "chrome-extension:", "brave:", "firefox:"].includes(
      u.protocol
    );
  } catch {
    return false;
  }
}

/** Debounce a function; returns a wrapper that delays invocation. */
export function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

/** Format a millisecond timestamp as a locale string. */
export function formatTimestamp(ts) {
  if (ts == null) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

/** Truncate a string to a max length with an ellipsis. */
export function truncate(str, maxLen) {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

/**
 * Deep-clone a workspace-like object. Workspaces are plain JSON, so this is a
 * structured-clone shortcut that also strips undefined values.
 */
export function cloneWorkspace(data) {
  return JSON.parse(JSON.stringify(data || {}));
}