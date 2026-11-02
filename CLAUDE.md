# Project: Cloud Workspace Launcher

A browser extension to save, sync, and launch browser workspaces (tabs, groups, pinned state).

## Completed
- **UI Modernization**: Converted the popup interface to Bootstrap 5.3 with a native dark theme (`data-bs-theme="dark"`).
- **Layout Bug Fix**: Resolved an issue where cards in the workspace list would shrink and clip buttons in the popup. Implemented proper flexbox scrolling behavior in `popup.css`.
- **Bootstrap Integration**: Bundled local Bootstrap CSS/JS in `src/lib/` to ensure offline support and bypass CSP issues.
- **Modal Logic Update**: Updated `popup.js` to use the Bootstrap Modal API, improving reliability and removing redundant custom show/hide handlers.
- **Visual Polish**: Tightened card padding (14px 16px 12px), card internals (head/meta/actions), and replaced browser-default ghost buttons with styled outline buttons.
- **Toast Notifications**: Replaced the custom overlay with Bootstrap's `toast` component — one toast per message, autohide, color-coded by kind (success/danger/secondary).
- **Options Page**: Converted `options.html`/`options.css`/`options.js` to Bootstrap 5.3 to match the popup design.
- **Testing**: Added a modal interaction test suite in `src/tests/test-modal.js` covering show/hide via the API and via the X button.
- **File Layout**: Moved loose test scripts into `src/tests/` and dev tooling into `src/scripts/`.
- **AI Auto-Naming**: `buildWorkspace` calls `generateWorkspaceName()` via Anthropic API when no manual name is provided. Loading spinner on Save button during generation.
- **Predictive Lazy Restore**: `restoreWorkspace` calls `predictCriticalTabs()` to keep 2-3 active tabs loaded. Toast notification "AI optimizing memory…" shown during restore.
- **Semantic Tab Grouping**: New `groupTabsWithAI()` organizes ungrouped tabs into Chrome tab groups with titles/colors. Enabled via `aiAutoGroup` setting.
- **UI Loading States**: Save button shows spinner/text "Generating…" during AI auto-naming; restore shows toast during predictive lazy restore.

## To Do
- None outstanding — all items from the previous backlog are complete.

*Last updated: 2026-10-26 — Work paused for the day.*