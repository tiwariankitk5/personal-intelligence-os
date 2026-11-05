# PeekNotes-inspired web deck

Implemented in PIOS: an account-backed, searchable edge deck available across workspace pages; choose left/right (remembered per account/browser); hover or click the edge handle; pinned/recent or title sorting; active/archive filtering; up to three floating panels; draggable headers on desktop; expanded view; six existing note colors; pin/archive/restore; ten-second archive undo; JSON export; safely escaped text additions which preserve formatted content. Alt+Shift+P toggles the deck while the page has focus. Escape closes the deck. Unsaved additions require confirmation before closing their panel.

This uses existing PIOS note persistence and account isolation. Changes are available on another signed-in device after Refresh; this is not live collaborative synchronization. Refresh first drains pending note writes. Concurrent device edits currently use last write wins. The Notes editor retains permanent delete and PDF/HTML/CSV export. JSON here is export only.

The separate Electron companion now provides native always-on-top windows, a global shortcut, tray controls and opt-in packaged startup; Windows portable packaging and hidden native smoke passed. See desktop/README.md. Native fullscreen detection, macOS runtime/signing, local-only storage, import and eight-color parity remain pending. Mobile uses the responsive web deck.

Validation: frontend tests/types/production build; headless Edge checks for failed-save retry without duplication, append persistence, archive/undo, expanded view, side preference, responsive 390/820px layouts and no page exceptions. See scripts/learning-peek-browser.cjs (requires ignored local Playwright installation). Physical iPad/stylus and native operating-system behavior remain unverified.
