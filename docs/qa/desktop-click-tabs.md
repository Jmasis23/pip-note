# Desktop click tabs

The user replaced both hover triggers with small orange click targets. The top tab opens the existing dashboard; the right tab toggles the existing folder dock and note panels. Marks are 28 by 4 pixels (rotated on the side), with 44 by 12 pixel transparent buttons for easier clicking and keyboard focus. Hovering does not open anything. A second click on the right tab closes the folder dock; pinned panels retain their existing behavior.

## Cleanup and reliability

Removed the hover policy, timers, top-edge dwell, rearm rules, dashboard reveal animation, and unused mouse-button API feature. Native sampling is now 100 ms and only maintains monitor placement/fullscreen suppression. The collapsed tabs follow the active monitor; open/pinned panels stay on their current monitor. Desktop applications receive clicks outside the reported controls.

Region reporting uses coalesced microtasks rather than animation frames. In 0.2.53 the old scheduler could deadlock when a completely clipped WebView2 stopped painting, leaving an empty Win32 region despite visible accessibility controls. Always-present tabs and paint-independent reporting avoid that failure.

## Verification

- `npm test`: PASS, 88 tests across 17 files, including click-only toggling and geometry updates without animation frames.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `cargo check --tests --manifest-path src-tauri/Cargo.toml`: PASS.
- `cargo test --manifest-path src-tauri/core/Cargo.toml`: PASS.
- Standalone desktop geometry test: PASS (1), covering DPI and negative coordinates.
- Browser preview: tiny marks render; right click target opens and closes the existing folder rail.
- Full local `cargo test --manifest-path src-tauri/Cargo.toml`: blocked by the GNU linker/export-ordinal limitation and test DLL entry-point failure. Local MSVC is missing `link.exe`; Windows CI uses MSVC.
- Windows CI and interactive installed-build verification are separate from browser and policy tests. The existing installed 0.2.53 was inspected; the replacement has not been installed by this coding task.

## Windows checklist

1. Start Pip in tray mode. Confirm a tiny orange mark at the top and right of the work area. Moving along either edge must not open a window.
2. Click the right tab, select each folder, open a note, and toggle the tab closed/open. Confirm pin, close, note editing and drag-out still work independently of the dashboard.
3. Click the top tab with the dashboard hidden/minimized. It must open the actual dashboard and accept normal keyboard input. Minimize, maximize, close-to-tray and tray Quit must still work.
4. Click the desktop outside the marks/panels. Check mixed-DPI monitors, taskbar clearance, and fullscreen suppression. Check deliberate wiggle and the configured capture shortcut without changing existing notes/settings.

No changes to landing/, branding, AI, credential handling, note persistence, or the existing dock/panel appearance.
