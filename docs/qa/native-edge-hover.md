# Native Windows edge hover QA

## Implementation

The desktop source baseline is `windows/pip-app` at `9b537a3`; `main` does not contain the desktop application. The feature commit is the integration delta. A main-targeted PR necessarily also carries the pre-existing desktop history. `landing/` has no changes in the PR diff. No AI, provider, credential, capture-editor, or branding code was changed by the integration.

Rust samples the cursor every 25 ms, without adding another global mouse hook. Right-edge entry uses a 3 physical-pixel zone with a 450 ms exit grace; the top edge uses a 175 ms dwell and a 16 pixel rearm zone. Monitor identity and work areas come from Win32. Dock placement is physical; rendered hit regions are converted from logical pixels using the window scale and rebuilt on DPI changes. A native window region leaves uncovered desktop areas clickable. Hover uses SWP_NOACTIVATE; clicking UI activates normally. The top trigger restores/raises the real dashboard without focus, once per entry. Existing maximize/minimize/close and tray rebuilding remain.

The existing FolderRail and Editor run in a separate transparent host; dragged-out cards use the same Floating component in native note windows. Hidden unpinned panels remain mounted to preserve dirty/error/conflict recovery. Pinned folders stay visible; floating notes retain independent positions. Foreground borderless windows covering a monitor suppress the dock and floating notes on that monitor. Restoring them does not request focus.

Every native repository operation reads a shared Rust snapshot. Writes use a mutex-protected compare-and-set, retry whole-store contention, preserve note revision conflicts, and broadcast only after persistence succeeds. Preference deltas merge scalar fields, folder pin sets, and per-note colors/positions. This prevents another webview's stale cache from replacing saved notes. The existing FileKv per-file atomic replacement is retained; backups write before the live store, not as a multi-file crash transaction.

## Automated checks (2026-10-20)

- `cargo test --manifest-path src-tauri/core/Cargo.toml`: PASS, 36 tests and 0 doc tests.
- `rustc --test src-tauri/src/edge_policy_tests.rs -o work/edge-tests.exe` followed by `./work/edge-tests.exe`: PASS, 7 edge/grace/monitor/fullscreen/rearm/DPI policy tests.
- `cargo test --manifest-path src-tauri/Cargo.toml`: FAIL in the local GNU toolchain at DLL linking, `export ordinal too large: 137710`. Earlier attempts also encountered missing GNU build tools; supplying local MSYS2 tools allowed Rust compilation to complete before this link failure.
- `cargo test --lib --manifest-path src-tauri/Cargo.toml`: harness compiled, FAIL on execution with `0xc0000139 STATUS_ENTRYPOINT_NOT_FOUND`. No passing Tauri test result is claimed. Windows CI now runs this command with MSVC before building the installer.
- `cargo check --tests --manifest-path src-tauri/Cargo.toml`: PASS, including native Win32 integration and Tauri test compilation.
- `npm test`: PASS, 85 tests across 15 files, including cross-window contention, stale revision, failed persistence, preference merge, retained editor and repeated redock regressions.
- `npm run typecheck`: PASS.
- `npm run build`: PASS (TypeScript and Vite production build).
- `rustfmt --check --edition 2021 --config skip_children=true src-tauri/src/desktop.rs src-tauri/src/edge_policy.rs src-tauri/src/edge_policy_tests.rs`: PASS.
- `git diff --check`: PASS.
- No frontend lint script is defined. No installer was published or installed.

The local Rust setup was Windows GNU, with build tools isolated in ignored `work/`; no application dependency was added. Cargo.lock records existing manifest-declared autostart/notification dependencies previously absent from the lock, plus their transitive resolution. Win32 feature flags reuse the existing windows crate.

## Browser checks

Inspected the hosted `https://pip-app-preview.pages.dev/` dashboard, `?capture`, `?empty`, and `?gate`: dashboard/navigation, capture fields/close/save controls, empty state, and sign-in wall render. The hosted deployment presents an older capture design than the current desktop source; these are baseline checks, not validation of this branch. Also checked this branch's local `?desktop-dock&seed` route: existing folder tiles and Work folder panel render. Native edge detection, click-through, focus, taskbar, tray, and fullscreen cannot be validated in a browser.

## Manual Windows checklist (not executed)

Use an MSVC build on the user's Windows desktop. Keep a recoverable test workspace and do not enter credentials in logs.

- Start normally and with `--background`; confirm dock works before opening dashboard and after minimizing/closing it to tray. Tray Open/Capture/Quit and second-instance activation still work.
- Work in Chrome and VS Code. Touch the right edge at several heights, enter the dock, open each folder/head, select and edit notes, then leave. Check immediate entry, grace, no flicker, blank desktop click-through, and retained unsaved/conflict recovery.
- Drag a note out. Keep it open/pinned, close/reopen it, move it, and dock it back twice. Confirm the dashboard stays hidden. Edit the same note in two windows to exercise conflict recovery. Restart and verify saved text, title, folder and pin state.
- Dwell at the top edge with the dashboard hidden, minimized, behind another app, maximized and already visible. Confirm one reveal per entry, no hover keyboard-focus theft, normal focus on clicked text fields, and no automatic close when leaving.
- Use two monitors including a negative origin, 100/150/200% mixed DPI, and vertically stacked layouts. Trigger on each monitor, move across boundaries rapidly, move notes independently, change primary display/resolution, and unplug/reconnect a display. Confirm regions, cards, taskbar clearance and placement.
- Exercise taskbars at bottom/right/top and auto-hide. Click and drag near trigger edges; held mouse buttons must not create new hover activations.
- Enter/leave borderless and exclusive fullscreen games/video; confirm Pip remains suppressed and restores without activating itself. Test foreground transitions on either monitor. Detection intentionally treats borderless full-monitor windows conservatively as fullscreen.
- Wiggle deliberately and use Ctrl+Shift+Space from another app. Confirm the existing capture opens alone; autosave, first-line title, Esc/Ctrl+Enter, resize, and tray capture still work.
- Check light/dark/reduced motion, keyboard traversal, multiple folders, folder creation, pinning, storage failure/conflict recovery, and concurrent preference changes. Observe idle CPU and ensure hover adds no extra low-level hook.

## Actual limits

Native interactive Windows QA and an MSVC installer build remain outstanding. Local GNU link/runtime failures above are unresolved; passing browser/policy/core checks do not certify native behavior. Exclusive fullscreen behavior is guarded conservatively by foreground window geometry/style; validate against the user's games and monitor layout. Floating cards are initially sized and positioned within the dock monitor's work area. Display-disconnect recovery still requires manual validation.
## 2026-10-20 follow-up: invisible native dock

On installed 0.2.53, Computer Use found the folder buttons in accessibility data, but no visible/clickable rail. A read-only native diagnostic found the top-level dock visible at the correct work-area bounds and 96 DPI, with an empty Win32 region. The frontend had switched the rail to visible but scheduled its region update through requestAnimationFrame; an entirely clipped/occluded WebView2 can suspend those frames, so the update needed to enable painting never ran.

The region observer now coalesces changes through microtasks, independent of painting. An in-flight native update is followed by a fresh measurement; failed invocations retry with a delay rather than starving the event loop. New regression tests hold animation frames indefinitely and reveal/retract the rail, and change geometry during an unfinished native update. Both fail with the original scheduler and pass with the fix.

Local validation: `npm test` passes 87 tests; `npm run typecheck` and `npm run build` pass. Windows CI and interactive verification of the corrected installer are recorded below when available. The local MSVC attempt could not link because Visual Studio Build Tools lacks the C++ linker; no native-test success is claimed from that attempt.
