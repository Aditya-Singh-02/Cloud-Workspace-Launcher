# Cloud Workspace Launcher — Hackathon Report

## Overview

A browser extension that saves, syncs, and relaunches entire browser
workspaces — tabs, tab groups, pinned state, scroll position, and form state —
in one click. Backed by three interchangeable storage backends so users can
choose between local-only, Firebase cloud sync, or a custom REST API.

**New in this version:** Context-aware AI features powered by Anthropic Claude:
- **Intelligent Auto-Naming** — generate contextual workspace names (e.g. "React
  App Development") instead of timestamps.
- **Predictive Lazy Restore** — let the model decide which tabs are "active"
  (editors, dashboards) and keep only those loaded in memory.

## What It Does

- **Capture** — snapshot the current window (tabs + tab groups + pinned state).
- **Restore** — reopen a saved workspace into the current window, replace the
  current window, or open it in a brand-new window.
- **Three backends** — switch in Settings:
  - **Local** — `chrome.storage` only. Offline, no setup, no cloud.
  - **Firebase** — Firestore sync across signed-in devices (needs a Firebase
    project).
  - **Custom** — your own REST API (`GET/POST /workspaces`,
    `GET/DELETE /workspaces/:id`).
- **Auto-capture** — debounced snapshot on tab/window changes.
- **AI Auto-Naming** — optional Anthropic API key generates a contextual name
  from captured tab metadata at save time.
- **Predictive Lazy Restore** — optional Anthropic API key predicts which tabs
  are "active" during restore, discarding only the passive ones.
- **Privacy-first** — local backend never leaves the device; Firebase sync is
  opt-in; AI features send only tab titles/URLs directly to Anthropic.

## Architecture

```
src/
  utils.js          — pure helpers (generateId, isRestorableUrl, debounce, …)
  settings.js       — user settings persistence (chrome.storage.sync)
  storage.js        — storage abstraction: local / firebase / custom
  background.js     — service worker: capture, restore, sync, message router, AI helpers
  popup.html/.js/.css — toolbar popup (Bootstrap 5.3 dark theme)
  options.html/.js/.css — settings page (Bootstrap 5.3 dark theme)
  content.js        — content script bridge
  injected.js       — web-accessible script (main world) — form state capture/restore
  icons/            — 16/48/128 PNGs + SVG source
  lib/              — bundled Bootstrap 5.3 CSS/JS (offline, CSP-safe)
  tests/            — Puppeteer-based integration tests
  scripts/          — dev tooling (ASCII screenshot renderer)
scripts/
  generate-icons.py — regenerate PNGs from icon.svg (pip install pillow)
manifest.json      — MV3 manifest
```

## Key Implementation Details

- **Manifest V3** service worker with a message router dispatching
  `capture`, `save`, `restore`, `list`, `remove`, `getSettings`, etc.
- **Form-state capture/restore** runs in the page's main world via an injected
  script, so it survives page reloads during lazy restore.
- **Lazy restore** discards inactive tabs on restore to keep RAM usage bounded
  for large workspaces; tabs reload on demand.
- **Predictive lazy restore** (AI) asks the model which 2-3 tabs are worth
  keeping loaded before discarding the rest. Falls back to keeping only the
  first tab if the AI call fails.
- **Intelligent auto-naming** (AI) summarizes tab titles/URLs into a 2-4 word
  title at save time. Falls back to timestamp if the AI call fails.
- **Tab group reconstruction** rebuilds Chrome tab groups with original colors,
  titles, and collapsed state during restore.
- **Live sync** polls the backend every 5s and re-renders the popup only when
  the list actually changes.

## Current State

The extension is functional and visually consistent across the popup and
options page:

- **Popup** — Bootstrap 5.3 dark theme, Bootstrap Modal API for save/restore
  dialogs, Bootstrap Toast component for notifications, custom card styling
  with proper flexbox scrolling. **Loading states** for AI auto-naming (spinner
  on Save button) and AI predictive restore (toast notification).
- **Options page** — migrated to Bootstrap 5.3 to match the popup, now
  includes an **AI Features** section with API key input and feature toggles
  (Auto-name, Predictive restore, Semantic grouping).
- **Tests** — Puppeteer integration tests in `src/tests/` covering modal
  show/hide, layout geometry, extension loading, and Bootstrap loading.

## To-Do

- None outstanding — all items from the previous backlog are complete.

*Last updated: 2026-10-26*