/**
 * Options page — backend selection + per-backend config + capture prefs.
 */

import { getSettings, setSettings, isFirebaseConfigured } from "./settings.js";

const $ = (sel) => document.querySelector(sel);

const backendRadios = document.querySelectorAll('input[name="backend"]');
const firebasePanel = $("#firebase-panel");
const customPanel = $("#custom-panel");
const fbStatus = $("#fb-status");
const saveStatus = $("#save-status");

function setBackend(backend) {
  backendRadios.forEach((r) => (r.checked = r.value === backend));
  firebasePanel.hidden = backend !== "firebase";
  customPanel.hidden = backend !== "custom";
  document.querySelectorAll(".backend-card").forEach((c) => {
    c.classList.toggle("selected", c.dataset.backend === backend);
  });
}

function showStatus(el, msg, kind) {
  if (!msg) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false;
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

async function load() {
  const s = await getSettings();
  setBackend(s.backend);

  // Restore Method radio selection
  document.querySelectorAll('input[name="restoreMode"]').forEach((r) => {
    r.checked = r.value === s.restoreMode;
  });
  // Highlight the selected restore card
  document.querySelectorAll(".restore-card").forEach((c) => {
    c.classList.toggle("selected", c.querySelector("input").checked);
  });

  if (s.firebaseConfig) {
    $("#fb-apiKey").value = s.firebaseConfig.apiKey || "";
    $("#fb-authDomain").value = s.firebaseConfig.authDomain || "";
    $("#fb-projectId").value = s.firebaseConfig.projectId || "";
    $("#fb-storageBucket").value = s.firebaseConfig.storageBucket || "";
    $("#fb-appId").value = s.firebaseConfig.appId || "";
    $("#fb-messagingToken").value = s.firebaseConfig.messagingToken || "";
  }
  $("#custom-endpoint").value = s.customEndpoint || "";
  $("#capture-pinned").checked = s.capturePinned;
  $("#capture-groups").checked = s.captureGroups;
  $("#sync-on-save").checked = s.syncOnSave;
  // AI features
  $("#ai-api-key").value = s.aiApiKey || "";
  $("#ai-auto-name").checked = s.aiAutoName;
  $("#ai-predictive-restore").checked = s.aiPredictiveRestore;
  $("#ai-auto-group").checked = s.aiAutoGroup;
}

function readFirebaseConfig() {
  const apiKey = $("#fb-apiKey").value.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    authDomain: $("#fb-authDomain").value.trim(),
    projectId: $("#fb-projectId").value.trim(),
    storageBucket: $("#fb-storageBucket").value.trim(),
    appId: $("#fb-appId").value.trim(),
    messagingToken: $("#fb-messagingToken").value.trim(),
  };
}

document.querySelectorAll(".backend-card").forEach((card) => {
  card.addEventListener("click", () => {
    card.querySelector("input").checked = true;
    setBackend(card.dataset.backend);
  });
});

document.querySelectorAll(".restore-card").forEach((card) => {
  card.addEventListener("click", () => {
    card.querySelector("input").checked = true;
    document.querySelectorAll(".restore-card").forEach((c) => {
      c.classList.toggle("selected", c === card);
    });
  });
});

$("#save-btn").addEventListener("click", async () => {
  const backend = document.querySelector('input[name="backend"]:checked').value;
  const firebaseConfig = backend === "firebase" ? readFirebaseConfig() : null;

  if (backend === "firebase" && !isFirebaseConfigured(firebaseConfig)) {
    showStatus(fbStatus, "Please fill in apiKey, projectId, storageBucket and appId.", "error");
    return;
  }

  await setSettings({
    backend,
    firebaseConfig,
    customEndpoint: $("#custom-endpoint").value.trim(),
    capturePinned: $("#capture-pinned").checked,
    captureGroups: $("#capture-groups").checked,
    syncOnSave: $("#sync-on-save").checked,
    restoreMode: document.querySelector('input[name="restoreMode"]:checked').value,
    aiApiKey: $("#ai-api-key").value.trim(),
    aiAutoName: $("#ai-auto-name").checked,
    aiPredictiveRestore: $("#ai-predictive-restore").checked,
    aiAutoGroup: $("#ai-auto-group").checked,
  });
  setBackend(backend);
  showStatus(saveStatus, "Settings saved.", "ok");
});

load();