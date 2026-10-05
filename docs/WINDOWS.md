# Windows acceptance checklist

Run on Windows 11 x64 with C++ Build Tools, WebView2, Node 22+ and Rust stable. Use `npm ci`, `npm run tauri dev`, then `npm run tauri build`.

## Native proof

- Focus Notepad/browser/ordinary remote-work apps. Gesture in a Landmark opens only its assigned compact tool; main dashboard stays hidden.
- Enter/hover/scroll/sweep/single reversal do nothing. Deliberate wiggle fires once. Continuous wiggling stays spent. Pause plus cooldown allows a new gesture.
- Hold every mouse button while dragging; no activation. Check exclusions and full-screen suppression. Pause from main and tray; shortcuts remain alternatives.
- Configure two monitors including a negative desktop origin and 100%/150%/200% scaling. Draw/move/resize/name/delete/enable regions and add edge presets. Overlaps explain the conflicting names.
- Test unsaved regions in the full-monitor overlays. The actual Windows recognizer reports the tool without dispatch. Save, close overlays and confirm clicks pass through ordinary invisible regions.
- Move/rescale/disconnect a monitor while setup is open. Affected regions require review; stale saves must be rejected. Reconnect and explicitly approve positions.
- Activate each tool at each screen edge. Popup stays inside usable area and above taskbar. Escape saves draft then dismisses. Focus returns when Windows allows it. Passive references avoid unnecessary focus.

## Complete journeys

- Capture note/checklist/link/pasted image plus a managed copy and original shortcut. Restart; retrieve via type/project/search. Move the shortcut original and verify the missing-file error.
- Fill a snippet’s name/company/date fields, preview and copy. Project Shelf opens its assigned project. Edit/pin/unpin/close a floating reference; note stays saved.
- Set task due and waiting status; notifications are opt in. Verify running, tray-closed, full-quit, overdue-restart and OS sleep behaviors. Save and retrieve a resume card.
- Clipboard off by default; enable, copy text/image, pin, pause, change retention, exclude a process, clear history and restore a disabled-history backup.
- Simultaneously edit from two windows; stale save retains text. Independent drafts survive dismissal/restart and cannot erase each other.
- Export/import valid and damaged JSON; invalid import preserves current content. Back up/restore valid and malformed SQLite; corruption must be rejected before replacement.
- Close to tray with preference on, quit with preference off, quit from tray, relaunch, exercise second-instance behavior. Check listener error recovery and keyboard alternatives.
- Keyboard-only navigation, visible focus, dark/light contrast, reduced motion, resizing and high-DPI text. Confirm no remote runtime requests.

These interactive steps were not executed in the Linux implementation environment. Do not treat portable tests or browser UI tests as native acceptance.
