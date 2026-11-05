# Peek notes in the browser and desktop companion

Both the main PIOS browser page and the native companion provide individual colored edge tabs, hover previews and a shared editable floating-note component. Up to eight active pinned/recent notes appear as tabs. Click a tab to edit title/content directly; a serial queue autosaves after a short pause. Failed saves retain the draft and offer Retry. Saved edits update the tab/preview; close/minimize waits for saving. Existing rich blocks are preserved. Six colors, pin, archive/restore, JSON export and confirmed permanent deletion are supported.

## Browser

At localhost:3100, the + tab opens browse/search, New note, archive filtering, sort, refresh and left/right docking. Dock preference persists per account/browser. Alt+Shift+P toggles browse while the page has focus. Floating editors can be dragged, resized or expanded. Three editors may remain open; opening another is blocked instead of discarding an existing draft. Archive offers ten-second Undo. Long preview/search text wraps inside its panel. Refresh another signed-in device to load changes; there is no live conflict merge. Browser panels stay inside PIOS.

## Desktop

The separate Electron companion adds real always-on-top OS windows, a global shortcut, tray controls and optional packaged startup. Manual launch opens a visible workspace. See desktop/README.md for the portable build and remaining native release limits. Native fullscreen detection, Mac runtime/signing, offline storage/import, eight-color parity and a separate completion state remain pending.

## Validation

Frontend tests/types and production Docker builds pass. scripts/peek-web-smoke.cjs defaults to disposable ports 3130/8280 and checks colored tabs, wrapped previews, direct autosave, failed-save retry without duplication, formatting, color, archive/Undo, drag/expand, three-window safety, reload persistence and 390/820px layouts. scripts/learning-peek-browser.cjs also passed the Learning/create/complete/reload regression with the new browser editor. scripts/desktop-peek-smoke.cjs passed the shared editor's native lifecycle regression. Real physical iPad/stylus behavior remains unverified.

Use a disposable Compose project for test registrations; these scripts create synthetic accounts and delete their own test notes, and disposable volumes can then be removed. Configure PIOS_TEST_API_URL and PIOS_TEST_WEB_URL for a different isolated deployment. Avoid repeatedly creating test accounts against the normal app's IP registration quota.
