# Peek presentation privacy

## Browser workspace

Use **Hide Peek** in the top bar, or **Alt+Shift+H** while PIOS is focused. This hides the strip, previews, browse panel and floating Peek editors. Editors stay mounted so unsaved drafts survive hiding; saving/retry continues normally. Use **Show Peek notes** or the same shortcut to reveal them.

The preference is stored per account in this browser and synchronized across its open PIOS tabs. It does not hide ordinary notes in the main editor or other parts of PIOS. This is a manual presentation control: a browser cannot exclude individual visible DOM elements from another application's screen capture. Revealing Peek inside a shared tab/window makes it visible to viewers. The app does not claim to detect Zoom/Meet/Teams sharing automatically.

## Windows desktop companion

The newly built companion enables **Exclude Peek from screen capture (Windows)** by default. The tray and expanded deck expose the setting. It applies Windows content protection to the native edge window and every native floating note window before they are shown. The workspace window is not protected; browser Peek overlays inside that workspace start hidden unless explicitly enabled.

Use **Ctrl/Cmd+Alt+H** globally or the tray's **Hide all overlays / Reveal overlays** control to hide/reveal native overlays without closing note editors. If the shortcut is already taken, use the tray. Disabling capture protection intentionally allows Peek to appear in captures. The choice persists on the device.

Capture exclusion is not an absolute privacy guarantee. Verify the meeting application's captured preview before relying on it. Electron documents limitations with older Windows versions and macOS ScreenCaptureKit; this implementation enables exclusion only on Windows. On other platforms, hide overlays or share a specific application window that does not contain notes. A camera pointed at the display can still see local content.

Reference: https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows

## Verification

Frontend checks and desktop policy tests cover the existing application foundations. Isolated browser checks verify hiding, explicit reveal, keyboard toggling, preference synchronization and retention of an unsaved draft. Hidden real Electron windows verify Windows content-protection flags on the edge and note windows, changes to existing windows, overlay-hidden state, shortcut registration and rejection of privacy changes from note windows. These checks do not certify invisibility in a real Zoom, Meet, Teams or OBS recording; that requires a manual capture test with the chosen OS and sharing mode.
