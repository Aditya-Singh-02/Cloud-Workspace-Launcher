/**
 * Storage abstraction — three interchangeable backends behind one interface.
 *
 *   local   — chrome.storage.local only. No cloud, no auth, offline.
 *   firebase — Google Cloud Firestore REST API (MV3 CSP-compliant, zero external SDKs).
 *   custom  — POST/GET against your own server endpoint.
 *
 * The extension only ever calls save/load/list/remove. The backend is
 * selected in the options page and persisted in chrome.storage.
 */

import { getSettings } from "./settings.js";

const LOCAL_KEY = "workspaces";

/** Backend ids, in the order shown in the options UI. */
export const BACKENDS = {
  LOCAL: "local",
  FIREBASE: "firebase",
  CUSTOM: "custom",
};

/** ---- Local backend (chrome.storage.local) ---- */
const local = {
  async list() {
    const { [LOCAL_KEY]: list = [] } = await chrome.storage.local.get(LOCAL_KEY);
    return list;
  },
  async get(id) {
    const list = await local.list();
    return list.find((w) => w.id === id) || null;
  },
  async save(workspace) {
    const list = await local.list();
    const idx = list.findIndex((w) => w.id === workspace.id);
    if (idx >= 0) list[idx] = workspace;
    else list.push(workspace);
    await chrome.storage.local.set({ [LOCAL_KEY]: list });
    return workspace;
  },
  async remove(id) {
    const list = await local.list().then((l) => l.filter((w) => w.id !== id));
    await chrome.storage.local.set({ [LOCAL_KEY]: list });
  },
};

/** ---- Firebase backend (Firestore REST API — MV3 Native) ---- */

async function getFirestoreBaseUrl() {
  const { backend, firebaseConfig } = await getSettings();
  if (backend !== BACKENDS.FIREBASE || !firebaseConfig?.projectId || !firebaseConfig?.apiKey) {
    throw new Error("Firebase backend not configured. Check Settings.");
  }
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/(default)/documents/workspaces`;
  return { base, apiKey: firebaseConfig.apiKey };
}

const firebase = {
  async list() {
    const { base, apiKey } = await getFirestoreBaseUrl();
    const res = await fetch(`${base}?key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) throw new Error(`Firebase list error (${res.status})`);
    const data = await res.json();
    if (!data.documents) return [];
    return data.documents
      .map((doc) => {
        try {
          const raw = doc.fields?.payload?.stringValue;
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  },

  async get(id) {
    const { base, apiKey } = await getFirestoreBaseUrl();
    const res = await fetch(`${base}/${encodeURIComponent(id)}?key=${encodeURIComponent(apiKey)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firebase get error (${res.status})`);
    const doc = await res.json();
    const raw = doc.fields?.payload?.stringValue;
    return raw ? JSON.parse(raw) : null;
  },

  async save(workspace) {
    const { base, apiKey } = await getFirestoreBaseUrl();
    const updated = { ...workspace, updatedAt: Date.now() };
    const body = {
      fields: {
        id: { stringValue: String(updated.id) },
        name: { stringValue: String(updated.name || "") },
        updatedAt: { integerValue: String(updated.updatedAt) },
        payload: { stringValue: JSON.stringify(updated) },
      },
    };
    const res = await fetch(
      `${base}/${encodeURIComponent(updated.id)}?key=${encodeURIComponent(apiKey)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) throw new Error(`Firebase save error (${res.status})`);
    return updated;
  },

  async remove(id) {
    const { base, apiKey } = await getFirestoreBaseUrl();
    const res = await fetch(`${base}/${encodeURIComponent(id)}?key=${encodeURIComponent(apiKey)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Firebase delete error (${res.status})`);
    }
  },
};

/** ---- Custom backend (your own HTTP API) ---- */
const custom = {
  async cfg() {
    const { customEndpoint } = await getSettings();
    if (!customEndpoint) throw new Error("Custom server endpoint not set in Settings.");
    return customEndpoint.replace(/\/+$/, "");
  },
  async list() {
    const ep = await custom.cfg();
    const res = await fetch(`${ep}/workspaces`);
    if (!res.ok) throw new Error(`Custom backend error ${res.status}`);
    return res.json();
  },
  async get(id) {
    const ep = await custom.cfg();
    const res = await fetch(`${ep}/workspaces/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Custom backend error ${res.status}`);
    return res.json();
  },
  async save(workspace) {
    const ep = await custom.cfg();
    const res = await fetch(`${ep}/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workspace),
    });
    if (!res.ok) throw new Error(`Custom backend error ${res.status}`);
    return res.json();
  },
  async remove(id) {
    const ep = await custom.cfg();
    const res = await fetch(`${ep}/workspaces/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Custom backend error ${res.status}`);
  },
};

const BACKEND_MAP = {
  [BACKENDS.LOCAL]: local,
  [BACKENDS.FIREBASE]: firebase,
  [BACKENDS.CUSTOM]: custom,
};

/** Resolve the currently selected backend. */
export async function getBackend() {
  const { backend } = await getSettings();
  return BACKEND_MAP[backend] || local;
}

/** Public API — everything goes through these four functions. */
export const storage = {
  list: async () => (await getBackend()).list(),
  get: async (id) => (await getBackend()).get(id),
  save: async (ws) => (await getBackend()).save(ws),
  remove: async (id) => (await getBackend()).remove(id),
};

/** Default poll interval for live sync (ms). */
const SYNC_POLL_MS = 5000;

/**
 * Subscribe to live updates. Firestore's REST API has no real-time
 * subscription channel, so this polls the backend on a timer — which also
 * covers the local and custom backends behind one interface.
 *
 * Returns an unsubscribe function. The callback is invoked with the full
 * list of workspaces whenever the list changes (or on every poll if the
 * backend is Firebase, which has no change-detection signal).
 */
export function subscribe(callback, { intervalMs = SYNC_POLL_MS } = {}) {
  let last = null;
  let timer = null;

  const poll = async () => {
    try {
      const list = await storage.list();
      // Only fire when the list actually changed — avoids re-rendering the
      // popup on every tick for backends that don't change often.
      const next = JSON.stringify(list);
      if (next !== last) {
        last = next;
        callback(list);
      }
    } catch {
      /* backend unreachable — retry on the next tick */
    }
  };

  poll();
  timer = setInterval(poll, intervalMs);

  return () => {
    if (timer) clearInterval(timer);
  };
}