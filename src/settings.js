/**
 * User settings persistence — backend selection + per-backend config.
 * Stored in chrome.storage.sync so preferences follow the user across devices.
 */

const DEFAULT_SETTINGS = {
  backend: "local", // local | firebase | custom
  firebaseConfig: null, // { apiKey, appId, projectId, ... }
  customEndpoint: "", // e.g. https://api.example.com
  autoSync: true,
  syncOnSave: true,
  capturePinned: true,
  captureGroups: true,
  captureScroll: true, // capture each tab's scroll position and restore it
  lazyRestore: false, // discard inactive tabs on restore to save RAM
  // How much of each tab's state to capture/restore:
  //   "form"     — URLs + scroll + form field values (fast, small, best default)
  //   "mhtml"    — full page snapshot incl. form state (large, pixel-perfect)
  //   "session"  — whole-browser session restore (tabs + history + scroll + form)
  restoreMode: "form",
  // AI Provider & API keys
  aiProvider: "auto", // "auto" | "gemini" | "anthropic" | "openai" | "heuristic"
  geminiApiKey: "",
  anthropicApiKey: "",
  openaiApiKey: "",
  aiApiKey: "", // backward-compatible alias for Anthropic key
  aiAutoName: true, // generate a contextual name instead of a time-based one
  aiPredictiveRestore: false, // let the model pick which tabs stay loaded
  aiAutoGroup: true, // let AI organize tabs into semantic groups
  aiAutonameGroups: true, // autoname group tabs based on all available tabs
  aiAutoColor: true, // auto color based on tech-focused color scheming
  aiColorScheme: "tech-focused", // "tech-focused"
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

export async function setSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.sync.set({ settings: next });
  return next;
}

export function isFirebaseConfigured(config) {
  return !!(
    config &&
    config.apiKey &&
    config.appId &&
    config.projectId &&
    config.storageBucket
  );
}