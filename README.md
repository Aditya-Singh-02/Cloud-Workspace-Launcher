# Cloud Workspace Launcher

Save, sync, and launch entire browser workspaces (tabs, groups, pinned state)
in one click. Backed by three interchangeable storage backends.

## Features

- **Capture** — snapshot the current window (tabs + tab groups + pinned state).
- **Restore** — reopen a workspace in a new window, or into the current one.
- **Three backends** — switch in Settings:
  - **Local** — `chrome.storage` only. Offline, no setup, no cloud.
  - **Firebase** — Firestore sync across signed-in devices (needs a Firebase project).
  - **Custom** — your own REST API (`GET/POST /workspaces`, `GET/DELETE /workspaces/:id`).
- **Auto-capture** — debounced snapshot on tab/window changes.
- **Privacy-first** — local backend never leaves the device; Firebase sync is opt-in.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder.
4. Pin the extension to the toolbar.

## Usage

- Click the toolbar icon → list of saved workspaces.
- Type a name and hit **Save** (or click the camera icon to pre-fill a name).
- Click **Restore** to reopen all tabs in your current window.
- Click **Settings** (in the popup) to switch backends and configure capture prefs.

## Firebase setup

1. Create a project at [Firebase Console](https://console.firebase.google.com/).
2. Register a web app → copy `apiKey`, `authDomain`, `projectId`, `storageBucket`, `appId`.
3. In the extension Settings, select **Firebase** and paste the values.
4. No separate sign-in step — the extension talks to Firestore directly via its
   REST API using your project's `apiKey`. Make sure your Firestore security rules
   allow reads/writes for the API key (or scope them by user if you add auth later).

> Only client-side config is needed. Never commit a real `firebaseConfig.json`.

## Custom backend

Point the extension at any server implementing:

```
GET    /workspaces            -> [workspace, ...]
POST   /workspaces            -> workspace   (body: workspace JSON)
GET    /workspaces/:id        -> workspace | 404
DELETE /workspaces/:id        -> 200 | error
```

## File layout

```
src/
  utils.js          — pure helpers (generateId, isRestorableUrl, debounce, …)
  settings.js       — user settings persistence (chrome.storage.sync)
  storage.js        — storage abstraction: local / firebase / custom
  background.js     — service worker: capture, restore, sync, message router
  popup.html/.js/.css — toolbar popup
  options.html/.js/.css — settings page
  content.js        — content script bridge
  injected.js       — web-accessible script (main world)
  icons/            — 16/48/128 PNGs + SVG source
scripts/
  generate-icons.py — regenerate PNGs from icon.svg (pip install pillow)
manifest.json      — MV3 manifest
```

## Regenerate icons

```bash
pip install pillow
python scripts/generate-icons.py
```

---

## 🚀 Why We Built This
Not everyone has access to 32GB of RAM. **Cloud Workspace Launcher** is designed with accessibility and performance in mind—specifically targeting daily drivers and low-end devices. By turning cluttered, RAM-heavy browser windows into lightweight, cloud-synced snapshots, we aim to make workspace management fast, reliable, and hardware-friendly for everyone.

**Authors:** Created in collaboration by **Aditya Singh** & **Mayank Gupta**.