/**
 * Popup logic — list, save, restore, and delete workspaces.
 */

import { subscribe } from "./storage.js";

const $ = (sel) => document.querySelector(sel);

/** Bootstrap Modal instance for an element (creates it lazily). */
function bsModal(el) {
  if (!el) return null;
  return bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el, { backdrop: true });
}

/** Bootstrap Toast — create one per message so multiple toasts can stack. */
function showToast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast align-items-center text-white border-0";
  el.setAttribute("role", "alert");
  el.setAttribute("aria-live", "assertive");
  el.setAttribute("aria-atomic", "true");
  // Bootstrap color classes: default = secondary, ok = success, error = danger.
  const color = kind === "ok" ? "success" : kind === "error" ? "danger" : "secondary";
  el.className += ` bg-${color}`;
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${escapeHtml(String(msg ?? ""))}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;
  $("#toast").appendChild(el);
  const inst = new bootstrap.Toast(el, { delay: kind === "error" ? 8000 : 4000, autohide: true });
  inst.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

let listEl = $("#list");
let statusEl = $("#status");
let nameInput = $("#name-input");
let saveBtn = $("#save-btn");
let captureBtn = $("#capture-btn");
let backendLabel = $("#backend-label");
let settingsLink = $("#settings-link");

let workspaces = [];
let settings = null; // cached from getSettings, used to gate AI UI behaviour

function setStatus(msg, kind = "") {
  // Persistent progress ("Saving…", "Restoring…") stays in the status bar.
  // Final results / errors fire a toast so they don't compete for the bar.
  if (!kind) {
    if (!statusEl) return;
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.className = "status";
    return;
  }
  showToast(msg, kind);
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString();
}

function renderList() {
  if (!workspaces.length) {
    listEl.innerHTML = `<div class="empty">No saved workspaces yet.<br />Capture a window to get started.</div>`;
    return;
  }

  listEl.innerHTML = workspaces
    .map((w) => {
      const count = w.snapshot?.tabs?.length ?? 0;
      const groups = w.snapshot?.groups || [];
      const groupCount = groups.length;
      const groupPills = groupCount
        ? `<div class="card-groups d-flex flex-wrap gap-1 mt-1 mb-2">` +
          groups
            .slice(0, 4)
            .map(
              (g) =>
                `<span class="group-pill group-pill-${g.color || "grey"}" title="${escapeAttr(g.title || "Group")} (${g.color || "grey"})">${escapeHtml(g.title || "Group")}</span>`
            )
            .join("") +
          (groupCount > 4 ? `<span class="group-pill group-pill-more">+${groupCount - 4}</span>` : "") +
          `</div>`
        : "";

      return `
        <article class="card" data-id="${w.id}">
          <div class="card-head">
            <h3 class="card-title">${escapeHtml(w.name)}</h3>
            <span class="card-time">${fmtTime(w.updatedAt || w.createdAt)}</span>
          </div>
          <div class="card-meta">
            <span>${count} tab${count === 1 ? "" : "s"}</span>
            ${groupCount ? `<span>· ${groupCount} group${groupCount === 1 ? "" : "s"}</span>` : ""}
            ${w.device ? `<span>· ${escapeHtml(w.device)}</span>` : ""}
          </div>
          ${groupPills}
          <div class="card-actions">
            <button class="ghost restore" title="Restore into this window">Restore</button>
            <button class="ghost danger delete" title="Delete">Delete</button>
          </div>
        </article>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Escape a string for safe use inside a double-quoted HTML attribute. */
function escapeAttr(s) {
  return String(s ?? "").replace(/["&]/g, (c) => (c === '"' ? "&quot;" : "&amp;"));
}

async function refresh() {
  try {
    workspaces = await send({ type: "list" });
    renderList();
  } catch (e) {
    setStatus("Failed to load workspaces.", "error");
  }
}

function send(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!resp || !resp.ok) {
        reject(new Error((resp && resp.error) || "Request failed"));
        return;
      }
      resolve(resp.payload);
    });
  });
}

/* ---------------- Save modal (tab picker) ---------------- */

let pendingSnapshot = null; // snapshot captured while waiting for user to pick tabs

const saveModal = $("#save-modal");
const saveName = $("#save-name");
const tabChecks = $("#tab-checks");
const saveCount = $("#save-count");
const saveConfirm = $("#save-confirm");

function openSaveModal(snapshot) {
  pendingSnapshot = snapshot;
  // Pre-fill the name with the camera icon's time-based default, unless the
  // user already typed something into the main name input. When AI auto-naming
  // is enabled we leave the field blank so the model can generate a name.
  if (saveName && !saveName.value.trim()) {
    if (settings?.aiAutoName) {
      saveName.value = "";
    } else {
      saveName.value = nameInput?.value.trim() || `Workspace ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
  }
  renderTabChecks(snapshot);
  bsModal(saveModal).show();
  saveName?.focus();
}

function closeSaveModal() {
  bsModal(saveModal).hide();
  pendingSnapshot = null;
  tabChecks.innerHTML = "";
}

function renderTabChecks(snapshot) {
  const tabs = snapshot?.tabs || [];
  tabChecks.innerHTML = tabs
    .map((t, i) => {
      const title = escapeHtml(t.title || t.url || `Tab ${i + 1}`);
      const url = escapeHtml(t.url || "");
      const fav = t.favIconUrl
        ? `<div class="fav" style="background-image:url('${escapeAttr(t.favIconUrl)}')"></div>`
        : "";
      const tag = t.pinned ? `<span class="t-tag">pinned</span>` : "";
      return `
        <label class="tab-row">
          <input type="checkbox" name="tab" value="${t.id}" checked />
          ${fav}
          <span class="meta">
            <span class="t-title">${title}</span>
            <span class="t-url">${url}</span>
          </span>
          ${tag}
        </label>`;
    })
    .join("");
  updateSaveCount();
}

function updateSaveCount() {
  if (!saveCount) return;
  const checked = tabChecks.querySelectorAll('input[name="tab"]:checked').length;
  const total = tabChecks.querySelectorAll('input[name="tab"]').length;
  saveCount.textContent = `${checked} of ${total} tab${total === 1 ? "" : "s"} selected`;
}

function toggleAll() {
  const boxes = tabChecks.querySelectorAll('input[name="tab"]');
  const allChecked = [...boxes].every((b) => b.checked);
  boxes.forEach((b) => (b.checked = !allChecked));
  updateSaveCount();
}

function clearAll() {
  tabChecks.querySelectorAll('input[name="tab"]').forEach((b) => (b.checked = false));
  updateSaveCount();
}

async function confirmSave() {
  const name = saveName.value.trim();
  let selected = [...tabChecks.querySelectorAll('input[name="tab"]:checked')].map(
    (b) => b.value
  );
  if (!pendingSnapshot) {
    setStatus("Nothing captured yet — click the camera first.", "error");
    return;
  }
  // Checkbox values are strings, but tab ids are numbers — coerce so the
  // strict-equality filter in background.js's save handler matches.
  selected = selected.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  if (!selected.length) {
    setStatus("Select at least one tab to save.", "error");
    return;
  }

  // Loading state: show spinner if AI auto-naming is active and user didn't provide a name
  const useAiName = !name && settings?.aiAutoName && pendingSnapshot?.tabs?.length;
  if (useAiName) {
    saveConfirm.disabled = true;
    saveConfirm.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Generating…`;
  }
  saveBtn.disabled = true;
  setStatus("Saving…");
  try {
    const saveAiGroupEl = $("#save-ai-group");
    const aiAutoGroup = saveAiGroupEl ? saveAiGroupEl.checked : true;
    const ws = await send({
      type: "save",
      payload: {
        name,
        snapshot: pendingSnapshot,
        selected,
        opts: { aiAutoGroup },
      },
    });
    setStatus(`Saved "${ws.name}".`, "ok");
    closeSaveModal();
    await refresh();
  } catch (e) {
    setStatus(String(e.message || e), "error");
  } finally {
    saveBtn.disabled = false;
    if (useAiName) {
      saveConfirm.disabled = false;
      saveConfirm.textContent = "Save";
    }
  }
}

/* ---------------- Restore modal (mode picker) ---------------- */

let pendingRestore = null; // { id, name } waiting for a restore mode

const restoreModal = $("#restore-modal");
const restoreNameEl = $("#restore-name");
const modeOptions = $("#mode-options");
const restoreClose = $("#restore-close");
const restoreCancel = $("#restore-cancel");

const MODES = [
  {
    value: "alongside",
    title: "Restore into this window",
    desc: "Keep your current tabs and add the workspace's tabs alongside them.",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="10" height="14" rx="2"/><rect x="11" y="3" width="10" height="16" rx="2"/></svg>`,
  },
  {
    value: "replace",
    title: "Replace this window",
    desc: "Close every tab in the current window, then open the workspace's tabs.",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h11v10H3z"/><path d="M14 5h7v14H14z"/></svg>`,
  },
  {
    value: "new",
    title: "Restore into a new window",
    desc: "Open the workspace's tabs in a brand-new window. Current tabs stay untouched.",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M11 18h7v-4"/></svg>`,
  },
];

function openRestoreModal(id, name) {
  pendingRestore = { id, name };
  if (restoreNameEl) restoreNameEl.textContent = name || "";
  renderModeOptions();
  bsModal(restoreModal).show();
  const first = modeOptions.querySelector(".mode-opt");
  if (first) first.focus();
}

function closeRestoreModal() {
  bsModal(restoreModal).hide();
  pendingRestore = null;
  modeOptions.innerHTML = "";
}

function renderModeOptions() {
  modeOptions.innerHTML = MODES.map((m) => `
    <label class="mode-opt">
      <input type="radio" name="restore-mode" value="${m.value}" checked />
      <span class="mo-icon">${m.icon}</span>
      <span>
        <strong>${escapeHtml(m.title)}</strong>
        <span>${escapeHtml(m.desc)}</span>
      </span>
    </label>
  `).join("");
}

async function confirmRestore() {
  if (!pendingRestore) return;
  const mode = modeOptions.querySelector('input[name="restore-mode"]:checked')?.value || "alongside";
  const { id } = pendingRestore;

  // Check if AI predictive restore is enabled for this workspace
  // We need to fetch the workspace to check its settings
  try {
    const ws = await send({ type: "get", payload: id });
    if (ws && ws.aiApiKey && ws.aiPredictiveRestore) {
      showToast("AI optimizing memory…", "");
    }
  } catch {
    // Ignore - just don't show the toast
  }

  setStatus("Restoring…");
  try {
    await send({ type: "restore", payload: { id, mode } });
    setStatus("Restored.", "ok");
    closeRestoreModal();
    window.close();
  } catch (err) {
    setStatus(String(err.message || err), "error");
  }
}

/** Close whichever modal is currently open. */
function closeActiveModal() {
  if (saveModal && bsModal(saveModal)?.isShown) closeSaveModal();
  else if (restoreModal && bsModal(restoreModal)?.isShown) closeRestoreModal();
}

function bindEvents() {
  // Re-query in case the DOM finished parsing after this module ran.
  listEl = listEl || $("#list");
  statusEl = statusEl || $("#status");
  nameInput = nameInput || $("#name-input");
  saveBtn = saveBtn || $("#save-btn");
  captureBtn = captureBtn || $("#capture-btn");
  backendLabel = backendLabel || $("#backend-label");
  settingsLink = settingsLink || $("#settings-link");

  let aiGroupBtn = $("#ai-group-btn");

  if (aiGroupBtn) {
    aiGroupBtn.addEventListener("click", async () => {
      aiGroupBtn.disabled = true;
      const originalHtml = aiGroupBtn.innerHTML;
      aiGroupBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span><span style="font-size:11px;font-weight:600;">Grouping…</span>`;
      setStatus("AI organizing tabs & tech colors…");
      try {
        const res = await send({ type: "aiGroupCurrentWindow" });
        const updated = res?.updated || 0;
        const created = res?.created || 0;
        setStatus(
          `AI organized tabs (${created} group${created === 1 ? "" : "s"} created, ${updated} updated with tech colors).`,
          "ok"
        );
      } catch (err) {
        setStatus(String(err.message || err), "error");
      } finally {
        aiGroupBtn.disabled = false;
        aiGroupBtn.innerHTML = originalHtml;
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      setStatus("Capturing…");
      try {
        const snap = await send({ type: "capture" });
        if (nameInput && !nameInput.value.trim()) {
          nameInput.value = `Workspace ${new Date().toLocaleDateString()}`;
        }
        openSaveModal(snap);
      } catch (e) {
        setStatus(String(e.message || e), "error");
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  if (captureBtn) {
    captureBtn.addEventListener("click", async () => {
      setStatus("Capturing…");
      try {
        const snap = await send({ type: "capture" });
        nameInput.value = `Workspace ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        setStatus("Snapshot captured — tweak the name and hit Save.", "ok");
      } catch (e) {
        setStatus(String(e.message || e), "error");
      }
    });
  }

  if (listEl) {
    listEl.addEventListener("click", async (e) => {
      const card = e.target.closest(".card");
      if (!card) return;
      const id = card.dataset.id;
      if (e.target.classList.contains("restore")) {
        const cardEl = e.target.closest(".card");
        const wsName = cardEl?.querySelector(".card-title")?.textContent || "";
        openRestoreModal(id, wsName);
      } else if (e.target.classList.contains("delete")) {
        if (!confirm("Delete this workspace?")) return;
        try {
          await send({ type: "remove", payload: id });
          setStatus("Deleted.", "ok");
          await refresh();
        } catch (err) {
          setStatus(String(err.message || err), "error");
        }
      }
    });
  }

  if (settingsLink) {
    settingsLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  if (nameInput) {
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && saveBtn) saveBtn.click();
    });
  }

  /* Save modal controls */
  const saveClose = $("#save-close");
  const saveCancel = $("#save-cancel");
  const saveConfirm = $("#save-confirm");
  const saveSelectAll = $("#save-select-all");
  const saveClear = $("#save-clear");

  if (saveClose) saveClose.addEventListener("click", closeSaveModal);
  if (saveCancel) saveCancel.addEventListener("click", closeSaveModal);
  if (saveConfirm) saveConfirm.addEventListener("click", confirmSave);
  if (saveSelectAll) saveSelectAll.addEventListener("click", toggleAll);
  if (saveClear) saveClear.addEventListener("click", clearAll);

  if (saveName) {
    saveName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmSave();
      }
    });
  }

  if (tabChecks) {
    tabChecks.addEventListener("change", updateSaveCount);
  }

  /* Restore modal controls */
  const restoreClose = $("#restore-close");
  const restoreCancel = $("#restore-cancel");
  const restoreConfirm = $("#restore-confirm");
  if (restoreClose) restoreClose.addEventListener("click", closeRestoreModal);
  if (restoreCancel) restoreCancel.addEventListener("click", closeRestoreModal);
  if (restoreConfirm) restoreConfirm.addEventListener("click", confirmRestore);
  if (modeOptions) {
    modeOptions.addEventListener("change", () => {
      // Clicking a radio label already selects it; this keeps focus on the
      // selected option so keyboard users can confirm with Enter.
      const checked = modeOptions.querySelector('input[name="restore-mode"]:checked');
      if (checked) checked.parentElement.focus();
    });
  }

  // Enter key confirms restore when the modal is open.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && restoreModal && bsModal(restoreModal)?.isShown) {
      confirmRestore();
    }
  });
}

document.addEventListener("DOMContentLoaded", bindEvents);

(async () => {
  try {
    settings = await send({ type: "getSettings" });
    if (backendLabel) backendLabel.textContent = settings.backend;
  } catch {
    /* ignore */
  }
  await refresh();

  // Live sync: poll the backend so workspaces saved from another device
  // (or another tab) show up without a manual refresh. Stops when the popup
  // closes so it doesn't burn cycles in the background.
  const unsubscribe = subscribe((list) => {
    workspaces = list;
    renderList();
  });
  window.addEventListener("beforeunload", unsubscribe);
})();