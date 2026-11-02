/**
 * Background service worker — the extension's brain.
 *
 * Responsibilities:
 *   - Capture the current window (tabs + groups + pinned state) into a workspace.
 *   - Restore a saved workspace into a window (or the current one).
 *   - Save workspaces to the configured backend (local / firebase / custom).
 *   - Route popup/options messages and broadcast sync updates.
 */

import { storage, BACKENDS } from "./storage.js";
import { getSettings } from "./settings.js";
import { generateId, isRestorableUrl } from "./utils.js";
import {
  autonameTabGroup,
  organizeAllTabsWithAI,
  generateWorkspaceNameAI,
  predictCriticalTabsAI,
  COLOR_TAXONOMY,
  CHROME_TAB_COLORS,
} from "./ai.js";

const CAPTURE_DEBOUNCE_MS = 300;
const LOCAL_KEY = "workspaces";
const SCROLL_TIMEOUT_MS = 800;

let captureTimer = null;
let lastSnapshot = null;

// Map of tabId -> pending scroll position. Populated during restore so that
// scroll can be re-applied even if a tab is suspended (lazy restore) and
// reloads later. Cleared once the scroll is actually applied.
const pendingScrolls = new Map();

// Map of tabId -> pending form state. Same retry semantics as scroll.
const pendingForms = new Map();

// Per-session override for lazy restore (toggled from the popup). null =
// fall back to the workspace's saved captureLazy flag.
let captureLazyOverride = null;

/** Snapshot the current window: tabs + groups + pinned state.
 *  Returns ALL tabs with a `restorable` flag so the popup can let the
 *  user pick which ones to save (non-restorable tabs are shown but unselectable). */
async function snapshotWindow(windowId) {
  const [window, tabs, groups] = await Promise.all([
    chrome.windows.get(windowId, { populate: false }),
    chrome.tabs.query({ windowId }),
    chrome.tabGroups.query({ windowId }).catch(() => []),
  ]);

  // Read each tab's scroll position via the injected script. This is what
  // lets restore bring the user back to exactly where they were reading.
  const settings = await getSettings();
  const captureScroll = settings.captureScroll !== false;
  const captureForms = settings.restoreMode === "form";
  let scrollByTab = {};
  if (captureScroll) {
    const restorable = tabs.filter((t) => isRestorableUrl(t.url));
    const results = await Promise.allSettled(
      restorable.map((t) =>
        chrome.scripting.executeScript({
          target: { tabId: t.id },
          func: () => ({ x: window.scrollX, y: window.scrollY }),
        })
      )
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value?.[0]?.result) {
        scrollByTab[restorable[i].id] = r.value[0].result;
      }
    });
  }

  // Capture form field values when the user chose "Form State" restore mode.
  // Skips password/hidden fields — safe by default.
  let formByTab = {};
  if (captureForms) {
    const formResults = await Promise.allSettled(
      tabs.map(async (t) => {
        await ensureInjected(t.id);
        return { id: t.id, state: await captureFormState(t.id) };
      })
    );
    formResults.forEach((r) => {
      if (r.status === "fulfilled" && r.value.state) {
        formByTab[r.value.id] = r.value.state;
      }
    });
  }

  const tabRecords = tabs.map((t) => ({
    id: t.id,
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
    pinned: t.pinned,
    active: t.active,
    groupId: t.groupId ?? null,
    index: t.index,
    restorable: isRestorableUrl(t.url),
    scroll: scrollByTab[t.id] || null,
    form: formByTab[t.id] || null,
  }));

  return {
    windowId,
    state: window.state,
    tabs: tabRecords,
    groups: groups.map((g) => ({
      id: g.id,
      title: g.title,
      color: g.color,
      collapsed: g.collapsed,
    })),
    capturedAt: Date.now(),
  };
}

/**
 * Ask a content script to scroll a tab back to a saved position.
 * Retries a few times because the page may still be loading when the tab
 * is created — scroll would silently no-op on a blank page.
 */
function applyScrollToTab(tabId, scroll) {
  if (!scroll) return;
  pendingScrolls.set(tabId, { scroll, tries: 0 });
  _tryScroll(tabId);
}

/**
 * Ask a content script to restore form field values into a tab.
 * Retries until the page is ready and the injected script is available.
 */
function applyFormToTab(tabId, form) {
  if (!form) return;
  pendingForms.set(tabId, { form, tries: 0 });
  _tryForm(tabId);
}

async function _tryForm(tabId) {
  const entry = pendingForms.get(tabId);
  if (!entry) return;
  if (entry.tries >= 12) {
    pendingForms.delete(tabId);
    return;
  }
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        ready: document.readyState,
        hasApi: typeof window.__WorkspaceInjected,
      }),
    });
    if (result?.result?.ready === "complete" && result?.result?.hasApi) {
      await restoreFormState(tabId, entry.form);
      pendingForms.delete(tabId);
      return;
    }
  } catch {
    /* tab may be suspended / discarded — retry later */
  }
  entry.tries += 1;
  setTimeout(() => _tryForm(tabId), SCROLL_TIMEOUT_MS);
}

async function _tryScroll(tabId) {
  const entry = pendingScrolls.get(tabId);
  if (!entry) return;
  if (entry.tries >= 8) {
    pendingScrolls.delete(tabId);
    return;
  }
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        x: window.scrollX,
        y: window.scrollY,
        ready: document.readyState,
      }),
    });
    if (result?.result?.ready === "complete") {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (s) => window.scrollTo(s.x, s.y),
        args: [entry.scroll],
      });
      pendingScrolls.delete(tabId);
      return;
    }
  } catch {
    /* tab may be suspended / discarded — retry later */
  }
  entry.tries += 1;
  setTimeout(() => _tryScroll(tabId), SCROLL_TIMEOUT_MS);
}

/**
 * Inject the web-accessible script into a tab so we can call its
 * captureFormState / restoreFormState helpers. Idempotent — if it's already
 * there, no-op. Falls back gracefully on failure.
 */
async function ensureInjected(tabId) {
  try {
    const [results] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => typeof window.__WorkspaceInjected,
    });
    if (results?.result === "function") return;
  } catch {
    /* fall through to inject */
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/injected.js"],
    });
  } catch {
    /* tab may be closing / suspended — skip form capture for this tab */
  }
}

/** Capture form field values from a tab via the injected script. */
async function captureFormState(tabId) {
  try {
    const [results] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const api = window.__WorkspaceInjected;
        return api ? api.captureFormState() : null;
      },
    });
    return results?.result || null;
  } catch {
    return null;
  }
}

/** Restore form field values into a tab via the injected script. */
async function restoreFormState(tabId, state) {
  if (!state) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (s) => {
        const api = window.__WorkspaceInjected;
        if (api) api.restoreFormState(s);
      },
      args: [state],
    });
  } catch {
    /* tab may not be ready yet — best-effort */
  }
}

/** Debounced auto-capture; updates lastSnapshot for the popup to read. */
export function scheduleCapture(windowId) {
  if (captureTimer) clearTimeout(captureTimer);
  captureTimer = setTimeout(async () => {
    try {
      lastSnapshot = await snapshotWindow(windowId);
    } catch {
      /* window may have closed between schedule and fire */
    }
  }, CAPTURE_DEBOUNCE_MS);
}

/** Build a full workspace object from a snapshot + metadata. */
export async function buildWorkspace(name, snapshot, opts = {}) {
  const settings = await getSettings();
  let finalName = name;
  if (!finalName || !finalName.trim()) {
    // Intelligent auto-naming: generate contextual title based on captured tabs
    if (settings.aiAutoName !== false) {
      const aiName = await generateWorkspaceNameAI(snapshot?.tabs, settings);
      if (aiName) finalName = aiName;
    }
    if (!finalName || !finalName.trim()) {
      finalName = `Workspace ${new Date().toLocaleDateString()}`;
    }
  }
  return {
    id: generateId(),
    name: finalName,
    snapshot,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    device: (typeof navigator !== "undefined" && navigator.platform) || "unknown",
    capturePinned: settings.capturePinned,
    captureGroups: settings.captureGroups,
    captureScroll: settings.captureScroll,
    captureLazy: settings.lazyRestore,
    aiApiKey: settings.aiApiKey,
    aiAutoName: settings.aiAutoName,
    aiPredictiveRestore: settings.aiPredictiveRestore,
    aiAutoGroup: settings.aiAutoGroup,
    ...opts,
  };
}

/**
 * Restore a workspace.
 *  mode: "alongside" | "replace" | "new"
 *   - alongside — append saved tabs to the current window, keep existing tabs.
 *   - replace   — close every tab in the current window, then open saved tabs.
 *   - new       — open saved tabs in a brand-new window.
 */
export async function restoreWorkspace(workspace, mode = "alongside") {
  const snap = workspace.snapshot;
  if (!snap || !snap.tabs.length) {
    throw new Error("Workspace is empty — nothing to restore.");
  }

  const tabs = snap.tabs.filter((t) => t.restorable !== false);

  // Lazy-restore: keep only the first tab loaded, discard the rest so a big
  // workspace doesn't balloon RAM usage. The discarded tabs reload on demand
  // when the user switches to them.
  const lazyRestore =
    (captureLazyOverride ?? workspace.captureLazy) !== false && tabs.length > 1;

  // Predictive lazy restore: ask AI which tabs are worth keeping loaded
  // instead of always keeping only the first tab.
  let keepLoadedIndices = [0];
  if (lazyRestore && workspace.aiPredictiveRestore) {
    const settings = await getSettings();
    const predicted = await predictCriticalTabsAI(tabs, settings);
    if (predicted && predicted.length) keepLoadedIndices = predicted;
  }

  if (mode === "new") {
    // windows.create does NOT accept `pinned` — open the window first, then pin.
    const win = await chrome.windows.create({ url: tabs.map((t) => t.url) });
    const created = await chrome.tabs.query({ windowId: win.id });
    for (let i = 0; i < created.length; i++) {
      if (tabs[i].pinned) {
        await chrome.tabs.update(created[i].id, { pinned: true });
      }
    }
    await _reconstructGroups(snap, created, win.id);
    created.forEach((t, i) => {
      applyScrollToTab(t.id, tabs[i]?.scroll);
      applyFormToTab(t.id, tabs[i]?.form);
    });
    if (lazyRestore) await _lazyDiscard(win.id, created, keepLoadedIndices);
    return { windowId: win.id, tabCount: created.length, mode };
  }

  const currentWindow = await chrome.windows.getCurrent();

  // Snapshot existing tabs BEFORE creating new ones. In "replace" mode we
  // must NOT remove them until the new tabs are open — removing the last tab
  // in a window closes the window and invalidates currentWindow.id.
  const existingIds = (await chrome.tabs.query({ windowId: currentWindow.id })).map(
    (t) => t.id
  );

  const groupMap = new Map(); // oldGroupId -> [newTabIds]
  const createdTabs = [];

  for (const tab of tabs) {
    const createdTab = await chrome.tabs.create({
      url: tab.url,
      windowId: currentWindow.id,
      pinned: workspace.capturePinned !== false ? !!tab.pinned : false,
      active: false, // Prevents violent screen flickering while opening
    });
    createdTabs.push({ tab: createdTab, source: tab });
    if (workspace.captureGroups !== false && tab.groupId && tab.groupId !== -1) {
      if (!groupMap.has(tab.groupId)) groupMap.set(tab.groupId, []);
      groupMap.get(tab.groupId).push(createdTab.id);
    }
  }

  // Reconstruct Chrome Tab Groups with original colors, titles, collapsed state.
  if (workspace.captureGroups !== false && Array.isArray(snap.groups)) {
    for (const grp of snap.groups) {
      const tabIdsToGroup = groupMap.get(grp.id);
      if (tabIdsToGroup && tabIdsToGroup.length > 0) {
        const newGroupId = await chrome.tabs.group({
          tabIds: tabIdsToGroup,
          createProperties: { windowId: currentWindow.id },
        });
        await chrome.tabGroups.update(newGroupId, {
          title: grp.title || "",
          color: grp.color || "grey",
          collapsed: !!grp.collapsed,
        });
      }
    }
  }

  // Now safe to close the original tabs — the new window is stable.
  if (mode === "replace" && existingIds.length) {
    await chrome.tabs.remove(existingIds);
  }

  createdTabs.forEach(({ tab: createdTab, source }) => {
    applyScrollToTab(createdTab.id, source?.scroll);
    applyFormToTab(createdTab.id, source?.form);
  });
  if (lazyRestore) {
    await _lazyDiscard(
      currentWindow.id,
      createdTabs.map((c) => c.tab),
      keepLoadedIndices
    );
  }

  return { windowId: currentWindow.id, tabCount: createdTabs.length, mode };
}

/**
 * Rebuild tab groups inside a freshly created window (used for "new" mode).
 */
async function _reconstructGroups(snap, createdTabs, windowId) {
  if (!Array.isArray(snap.groups)) return;
  const bySourceId = new Map(createdTabs.map((t) => [t.id, t]));
  const groupMap = new Map();
  // createdTabs[i] corresponds to snap.tabs[i] (same order), so map back.
  snap.tabs.forEach((src, i) => {
    if (src.groupId && src.groupId !== -1 && createdTabs[i]) {
      if (!groupMap.has(src.groupId)) groupMap.set(src.groupId, []);
      groupMap.get(src.groupId).push(createdTabs[i].id);
    }
  });
  for (const grp of snap.groups) {
    const tabIdsToGroup = groupMap.get(grp.id);
    if (tabIdsToGroup && tabIdsToGroup.length > 0) {
      const newGroupId = await chrome.tabs.group({
        tabIds: tabIdsToGroup,
        createProperties: { windowId },
      });
      await chrome.tabGroups.update(newGroupId, {
        title: grp.title || "",
        color: grp.color || "grey",
        collapsed: !!grp.collapsed,
      });
    }
  }
}

/**
 * Discard all but the first tab in a window so they consume no memory until
 * the user activates them. Chrome reloads a discarded tab on demand.
 *
 * `keepLoadedIndices` is an array of 0-based indices into `tabs` that should
 * stay loaded (e.g. [0] = old default, or an AI-predicted set). Tabs whose
 * index is not in this list are discarded.
 */
async function _lazyDiscard(windowId, tabs, keepLoadedIndices = [0]) {
  if (!tabs || tabs.length <= 1) return;
  const keep = new Set(keepLoadedIndices);
  for (let i = 0; i < tabs.length; i++) {
    if (keep.has(i)) continue;
    try {
      await chrome.tabs.discard(tabs[i].id);
    } catch {
      /* tab may already be discarded or pinned — ignore */
    }
  }
}

/** Save a workspace to the configured backend. */
export async function saveWorkspace(workspace) {
  const saved = await storage.save(workspace);
  // Mirror to local for offline access when using a cloud backend.
  if ((await getSettings()).backend !== BACKENDS.LOCAL) {
    const { [LOCAL_KEY]: list = [] } = await chrome.storage.local.get(
      "workspaces"
    );
    const idx = list.findIndex((w) => w.id === saved.id);
    if (idx >= 0) list[idx] = saved;
    else list.push(saved);
    await chrome.storage.local.set({ workspaces: list });
  }
  return saved;
}

/** Message router. */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    capture: async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const snap = await snapshotWindow(tab.windowId);
      lastSnapshot = snap;
      return snap;
    },
    snapshot: () => lastSnapshot,
    save: async (payload) => {
      const snap = payload?.snapshot;
      const selected = payload?.selected; // array of tab ids to keep
      if (snap && selected) {
        snap.tabs = snap.tabs.filter((t) => selected.includes(t.id));
      }
      const settings = await getSettings();
      const ws = await buildWorkspace(payload?.name, snap, payload?.opts);

      // Autoname and auto-color existing tab groups based on all tabs available in each group
      if (snap && Array.isArray(snap.groups) && snap.groups.length > 0) {
        for (const grp of snap.groups) {
          const groupTabs = (snap.tabs || []).filter((t) => t.groupId === grp.id);
          if (groupTabs.length > 0) {
            const shouldAutoname = !grp.title || !grp.title.trim() || settings.aiAutonameGroups;
            if (shouldAutoname || settings.aiAutoColor) {
              const aiGroup = await autonameTabGroup(groupTabs, settings);
              if (shouldAutoname && aiGroup.title) {
                grp.title = aiGroup.title;
              }
              if (settings.aiAutoColor && aiGroup.color) {
                grp.color = aiGroup.color;
              }
            }
          }
        }
      }

      // Semantic tab grouping: if enabled, organize ungrouped tabs into AI-generated groups
      if ((ws.aiAutoGroup || settings.aiAutoGroup) && snap && snap.tabs?.length) {
        const ungroupedTabs = snap.tabs.filter((t) => t.groupId == null || t.groupId === -1);
        if (ungroupedTabs.length >= 2) {
          const groups = await organizeAllTabsWithAI(ungroupedTabs, settings);
          if (groups && groups.length) {
            let nextGroupId = 1;
            const existingGroupIds = new Set(
              (snap.groups || []).map((g) => g.id).filter((id) => id != null)
            );
            while (existingGroupIds.has(nextGroupId)) nextGroupId++;

            const newGroups = [];
            const tabIdToGroupId = new Map();

            for (const g of groups) {
              const groupId = nextGroupId++;
              newGroups.push({
                id: groupId,
                title: g.title,
                color: g.color,
                collapsed: false,
              });
              for (const localIdx of g.tabIndices) {
                const tab = ungroupedTabs[localIdx];
                if (tab) tabIdToGroupId.set(tab.id, groupId);
              }
            }

            // Apply groupId to tabs in the snapshot
            for (const tab of snap.tabs) {
              if (tabIdToGroupId.has(tab.id)) {
                tab.groupId = tabIdToGroupId.get(tab.id);
              }
            }

            // Append new groups to existing groups
            snap.groups = [...(snap.groups || []), ...newGroups];
          }
        }
      }

      return saveWorkspace(ws);
    },
    // AI feature: Organize open tabs in the current browser window right now
    aiGroupCurrentWindow: async () => {
      const settings = await getSettings();
      const win = await chrome.windows.getCurrent();
      const windowId = win?.id;
      if (!windowId) throw new Error("No active window found");

      const tabs = await chrome.tabs.query({ windowId });
      const existingGroups = await chrome.tabGroups.query({ windowId }).catch(() => []);
      const restorableTabs = tabs.filter((t) => isRestorableUrl(t.url));

      if (restorableTabs.length < 2) {
        throw new Error("Need at least 2 open tabs to organize.");
      }

      const results = { updated: 0, created: 0 };

      // Step 1: Autoname and color existing groups based on all tabs available in each
      for (const grp of existingGroups) {
        const tabsInGroup = tabs.filter((t) => t.groupId === grp.id);
        if (tabsInGroup.length > 0) {
          const aiNaming = await autonameTabGroup(tabsInGroup, settings);
          await chrome.tabGroups.update(grp.id, {
            title: aiNaming.title,
            color: aiNaming.color,
          });
          results.updated++;
        }
      }

      // Step 2: Organize ungrouped tabs into new AI groups with tech color scheming
      const ungroupedTabs = restorableTabs.filter((t) => t.groupId == null || t.groupId === -1);
      if (ungroupedTabs.length >= 2) {
        const aiGroups = await organizeAllTabsWithAI(ungroupedTabs, settings);
        for (const g of aiGroups) {
          const tabIds = g.tabIndices.map((idx) => ungroupedTabs[idx]?.id).filter(Boolean);
          if (tabIds.length > 0) {
            const newGroupId = await chrome.tabs.group({
              tabIds,
              createProperties: { windowId },
            });
            await chrome.tabGroups.update(newGroupId, {
              title: g.title,
              color: g.color,
              collapsed: false,
            });
            results.created++;
          }
        }
      }

      scheduleCapture(windowId);
      return { ok: true, ...results, totalTabs: restorableTabs.length };
    },
    // AI feature: Autoname a specific group
    aiAutonameGroup: async ({ groupId }) => {
      const settings = await getSettings();
      const tabs = await chrome.tabs.query({ groupId });
      if (!tabs || tabs.length === 0) {
        throw new Error("No tabs found in group");
      }
      const aiNaming = await autonameTabGroup(tabs, settings);
      await chrome.tabGroups.update(groupId, {
        title: aiNaming.title,
        color: aiNaming.color,
      });
      return aiNaming;
    },
    getColorTaxonomy: () => COLOR_TAXONOMY,
    restore: async ({ id, mode }) => {
      const ws = await storage.get(id);
      if (!ws) throw new Error(`Workspace ${id} not found`);
      return restoreWorkspace(ws, mode);
    },
    list: () => storage.list(),
    remove: (id) => storage.remove(id),
    get: (id) => storage.get(id),
    getSettings: () => getSettings(),
    ping: () => "pong",
    // Lazy-restore toggle — lets the popup flip RAM-saving mode on a
    // per-restore basis without re-opening the options page.
    setLazy: (lazy) => {
      captureLazyOverride = !!lazy;
      return { captureLazyOverride: captureLazyOverride };
    },
    getLazy: () => captureLazyOverride,
  };

  const handler = handlers[msg.type];
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
    return;
  }

  Promise.resolve(handler(msg.payload))
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // keep channel open for async sendResponse
});

/** Auto-capture on tab/window changes when auto-sync is on. */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && isRestorableUrl(tab.url)) {
    scheduleCapture(tab.windowId);
  }
});
chrome.tabs.onRemoved.addListener(() => {
  /* snapshot will refresh on next capture */
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.ID_NONE) scheduleCapture(windowId);
});

/** Keyboard command palette (Alt+Shift+W / Alt+Shift+R). */
chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === "quick-capture") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const snap = await snapshotWindow(tab.windowId);
      const ws = await buildWorkspace(
        `Workspace ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        snap
      );
      await saveWorkspace(ws);
      chrome.runtime.openOptionsPage();
    } else if (command === "restore-last") {
      const list = await storage.list();
      const last = list[list.length - 1];
      if (!last) return;
      await restoreWorkspace(last, "alongside");
    }
  } catch (e) {
    console.error("Workspace Launcher command failed:", e);
  }
});