# Peek notes in the browser and desktop companion

Both the main PIOS browser page and the native companion provide individual colored edge tabs, hover previews and a shared editable floating-note component. Only notes in the dedicated **Peek notes** folder appear in Peek. Up to eight active pinned/recent notes from that folder appear as tabs. Existing notes stay in their current folders; there is no automatic import or move. Click a tab to edit title/content directly; a serial queue autosaves after a short pause. Failed saves retain the draft and offer Retry. Saved edits update the tab/preview; close/minimize waits for saving. Existing rich blocks are preserved. Six colors, pin, archive/restore, JSON export and confirmed permanent deletion are supported.

## Browser

At localhost:3100, the + tab opens browse/search, New Peek note, archive filtering, sort, refresh and left/right docking. Dock preference persists per account/browser. Alt+Shift+P toggles browse while the page has focus. Floating editors can be dragged, resized or expanded. Three editors may remain open; opening another is blocked instead of discarding an existing draft. Archive offers ten-second Undo. Long preview/search text wraps inside its panel. Refresh another signed-in device to load changes; there is no live conflict merge. Browser panels stay inside PIOS.

## Desktop

The separate Electron companion adds real always-on-top OS windows, a global shortcut, tray controls and optional packaged startup. Manual launch opens a visible workspace. See desktop/README.md for the portable build and remaining native release limits. Native fullscreen detection, Mac runtime/signing, offline storage/import, eight-color parity and a separate completion state remain pending.

## Validation

Frontend tests/types and production Docker builds pass. scripts/peek-web-smoke.cjs defaults to disposable ports 3130/8280 and checks colored tabs, wrapped previews, direct autosave, failed-save retry without duplication, formatting, color, archive/Undo, drag/expand, three-window safety, reload persistence and 390/820px layouts. scripts/learning-peek-browser.cjs also passed the Learning/create/complete/reload regression with the new browser editor. scripts/desktop-peek-smoke.cjs passed the shared editor's native lifecycle regression. Real physical iPad/stylus behavior remains unverified.

Use a disposable Compose project for test registrations; these scripts create synthetic accounts and delete their own test notes, and disposable volumes can then be removed. Configure PIOS_TEST_API_URL and PIOS_TEST_WEB_URL for a different isolated deployment. Avoid repeatedly creating test accounts against the normal app's IP registration quota.

## Dedicated folder and recording style

New Peek note creates an untitled floating note in Peek notes, creating the folder on first use and reusing it afterward. The existing per-account folder-name uniqueness constraint protects concurrent creation; account-scoped APIs remain unchanged. The native companion uses the same folder rule. To deliberately include an existing note, move it into Peek notes in the normal note workspace. Renaming/moving notes out of that folder removes them from Peek.

Tabs retract visually to colored slivers and expand on hover/focus while their button hit targets remain fixed. Preview slides never cover tab click targets. Pastel cards use locally installed handwriting fonts with a cursive fallback, short entry/exit animations, a bottom formatting bar, and save-before-close. Reopening during the close animation cancels the old close request. Touch pointers retain full tab targets; prefers-reduced-motion disables animation/transition effects. No wallpaper or third-party assets are copied from the reference recording.

Updated browser checks verify first-use folder creation/reuse, ordinary-note preservation/exclusion, persisted bold formatting, normal preview animation and reduced motion in addition to the save/drag/mobile regressions. Native and Learning/browser smoke passed with dedicated-folder fixtures.

## Folder and motion verification — 2026-11-05
New Peek note creates/reuses the account's Peek notes folder and opens the editor directly. The browser/native edge feed excludes ordinary notebooks. Reference-style visuals include retracting colored paper tabs with stable button targets, sliding previews, pastel handwriting cards, entry/exit motion and compact formatting controls. The toolbar persists bold/italic/underline/strike/list/link edits; unsafe link schemes are rejected. Reduced-motion settings remove animation; touch tabs keep full targets. Reopening during close cancels the stale close callback.

The updated browser test passed first-use folder creation, subsequent reuse, preservation/exclusion of ordinary notes, persisted bold formatting, preview animation/reduced motion, save/retry, drag/expand, archive Undo, rapid close/reopen and phone/tablet layouts. Native and Learning/browser regressions passed on disposable ports. The normal local frontend is deployed on 3100; sign-in may be needed after the local stack update.
