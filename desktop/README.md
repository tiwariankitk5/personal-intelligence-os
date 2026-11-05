# PIOS Peek desktop companion

Portable Windows companion for the existing PIOS account. The web server/backend are separate and must be reachable. The default is http://localhost:3100; use PIOS_DESKTOP_URL=https://your-pios-host.example for a deployed PIOS frontend. Remote HTTP, credentials in URLs, paths and query strings are rejected.

## Run on Windows

1. Start PIOS using the repository start-pios script.
2. Open desktop/dist/PIOS-Peek-win32-x64/PIOS-Peek.exe. This portable local build is unsigned; do not distribute it as a production installer.
3. The workspace opens visibly on manual launch. Use the tray menu **Open PIOS / sign in** to reopen it. Sign in inside that window; the companion has its own session, separate from your normal browser.
4. Hover an individual colored edge tab to preview its note; click it to open. The + tab opens search and management. Up to eight pinned/recent notes appear on the edge; other notes remain searchable. Each note opens in its own resizable, always-on-top OS window. Reopening it focuses the existing window.
5. Ctrl+Alt+P (Cmd+Alt+P on Mac) toggles the edge deck globally. A conflicting registration is reported in the tray menu. Left/right docking is saved. Leaving the deck collapses it unless a new-note form is open.
6. Edit the title and note content directly; changes autosave through a serial queue after a short pause. Failed saves retain the draft and expose Retry. Existing rich blocks remain editable. Choose a color, pin, archive/restore, export JSON or explicitly confirm permanent deletion. Close/minimize waits for saving and returns the note to the edge. Saves update the edge tab and preview. Refresh the deck to see changes from other devices; close and reopen a floating window to refresh its contents. There is no live multi-device editing/conflict merge. Six existing account note colors are supported.
7. Tray options hide/resume overlays, open the workspace, configure launch at sign-in for packaged apps, or quit. Closing the workspace leaves the tray companion running. Launch at sign-in is off unless you enable it; enabled startup runs in the background.

## Development and packaging

From desktop/: npm ci; node node_modules/electron/install.js (only if install scripts were disabled); npm test; npm start. npm run package:win builds portable x64 Windows output; npm run package:mac targets Apple Silicon and requires Mac validation/signing before distribution. dist/ is ignored. Packaging overrides glob/minimatch to patched versions; verify npm audit and packaging together after upgrades.

The sandboxed renderer has no Node integration, with context isolation and web security enabled. The preload exposes only bounded note/window actions; privileged IPC validates the main frame, exact origin, route, window identity and arguments. Unexpected navigation/new windows and permissions are blocked. Session-cookie rotation clears native note windows. No API keys/passwords are sent through IPC. Existing server-side session/CSRF/account checks still apply.

## Verification and remaining work

Four policy tests cover app-origin validation, IPC URL/ID checks and multi-monitor edge bounds. Frontend tests/types/production build and desktop dependency audit pass. scripts/desktop-peek-smoke.cjs defaults to disposable frontend 3130/API 8280 (override PIOS_TEST_WEB_URL/PIOS_TEST_API_URL) and uses ignored Playwright to exercise hidden real Electron windows: edge resize, automatic title/content save, failed-save retry, rich heading preservation, edge refresh, one window per note, always-on-top flags, bad IPC rejection, workspace privilege rejection and note-window cleanup on sign-out. It uses synthetic accounts and deletes its test note; accounts remain in the local test database.

The portable executable also passed a direct local-CDP boot/bridge check; the Playwright Electron-application launcher timed out against the packaged executable, so the complete lifecycle smoke uses the development runtime.

Manual Windows visual/global-key/startup testing, macOS execution/notarization, signed installers/updates and automatic detection of other applications' fullscreen state remain open. The tray hide-overlays action is manual. Offline storage/import, eight-color parity and live cross-device synchronization are not implemented. Phone access uses the responsive PIOS web app. A remote backend session expiry clears note contents on the next API request; local cookie removal clears native windows immediately.

The screen recording supplied on 2026-11-05 guided colored individual tabs, hover previews and direct auto-saving floating notes. The recording also shows eight colors and a separate completion action; those are not represented as completed here. Archive remains an explicit archive action. The updated local portable build is desktop/dist/video-preview/PIOS-Peek-win32-x64/PIOS-Peek.exe so the previous running executable is preserved. Quit the old companion via its tray before launching this build; a running old instance otherwise receives a second-launch request.

The native and main browser views share frontend/src/components/floating-note-editor.tsx so direct editing/autosave stay consistent. Web floating panels now edit directly too; their dragging/expanding stays inside the browser.
