# Pip: remaining native Windows tests

A browser preview does not prove any of these. Run on a real Windows 10/11 machine with the CI installer artifact (not distributed).

## Priority order
1. Native cursor movement: low-level mouse hook reports moves at 60+ Hz, on multi-monitor and mixed DPI (100/125/150%), including negative-coordinate monitors.
2. Landmark matching: monitor-relative regions map to the right monitor after unplug/replug and resolution change.
3. Wiggle: deliberate wiggle opens a tool; normal mouse use, dragging, and gaming do not. Orange ring meter fills and resets.
4. Compact tool activation: each of the nine tools opens beside the cursor, stays on screen at edges, hides on blur after 500 ms grace.

## Other
- No gesture ever opens the main dashboard.
- Tray: Open, Capture, Landmarks... (opens sheet after main window rebuild), Pause wiggle gestures (check state matches behavior; resumes on restart), Quit.
- Floating References: drag, always-on-top, close; reference_open id validation.
- Hotkey and tray Capture open centered; Landmark Capture opens near cursor.
- Tray-resident close/reopen keeps data; atomic KV survives kill during save.
- Full-screen apps and excluded apps suppress gestures (when implemented).
- Windows Defender/SmartScreen behavior of the unsigned installer.
