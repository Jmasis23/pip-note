# Verification — October 5, 2026

This implementation has passing portable checks, Windows-target checks and an actual Windows CI installer build. It is **not yet a Windows runtime-validated release**. The local Linux installer build failed; GitHub’s Windows runner produced the downloadable installer.

## Completed checks

| Check | Result |
|---|---|
| `npm test` | 100 tests passed across 16 files |
| `cargo test --manifest-path src-tauri/core/Cargo.toml` | 71 tests passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed for the companion, Landmarks and runtime entry |
| `npm run format:check` | Passed |
| `npm run build` | Passed; production frontend built |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | Passed |
| Windows GNU-target `cargo check` | Passed |
| Windows GNU-target `cargo clippy --no-deps -- -D warnings` | Passed |
| `git diff --check` | Passed |
| GitHub Windows MSVC `cargo check --locked` | Passed in companion workflow |
| GitHub Windows NSIS installer build | Passed in existing Windows workflow |

The checks used Node 24.19, Rust 1.99, the repository lockfiles, and a locally extracted MinGW toolchain for the Windows target. The Windows compilation commands were:

```sh
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu
cargo clippy --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu --no-deps -- -D warnings
```

## What the tests establish

Recorded recognizer sequences cover deliberate wiggles, ordinary navigation, entering/hovering, single reversals, dragging, injected movement, boundary crossings, locked tool selection, bounded movement, cooldown and fresh retrigger behavior. Region tests cover overlaps, negative coordinates, mixed scaling calculations, resolution changes and display review flags. They exercise the portable engine rather than a running Windows hook.

SQLite tests exercise restart persistence, transactional compare-and-swap, backup, corrupt database rejection and rejection of malformed application content before restoring over valid data. Frontend tests cover schema validation, import, drafts, owner isolation, stale edits, snippet fields and safe utility behavior. Four DOM journeys exercise capture → acknowledged save → reload → retrieve/edit, draft reopening, main navigation and retained input after a stale edit.

A read-only code review identified nine material issues. The fixes add per-window draft ownership, stronger import/restore validation, stale Landmark rejection and explicit display review, runtime state reload on restore, unsaved fullscreen setup state, project-aware capture, paused clipboard retention, and seven-day automatic backup pruning. Relevant regression tests pass.

## Environment blockers

- Two `npx tauri build --target x86_64-pc-windows-gnu --bundles nsis` release attempts failed while Rust created dependency archives: `failed to map object file: memory map must have a non-zero length`. The second attempt disabled LTO and increased codegen units; it failed on a different dependency with the same archive error. This prevented local installer delivery; the separate Windows CI build subsequently succeeded.
- The browser verification daemon failed to start. A fallback Playwright Chromium download returned corrupt/truncated archives. No browser screenshot or rendered visual acceptance was completed. DOM tests are not a substitute for rendering, native input, tray or focus verification.
- This host is Linux. It cannot establish that the low-level mouse hook, monitor overlays, clipboard listener, foreground restoration, notifications or tray work correctly on Windows.

## Remaining acceptance

Run the [Windows checklist](WINDOWS.md) on Windows 11 with other applications focused, two monitors including negative coordinates and mixed scaling, display hotplug, clipboard exclusions, tray close/reopen, restart persistence, popup placement, keyboard dismissal and reminder behavior. Tune the default physical-pixel gesture thresholds from those results. Also inspect visual contrast, small tray readability, keyboard focus and reduced motion in the rendered desktop application.

The companion workflow’s portable job and Windows MSVC check passed in [run 37292452629](https://github.com/Jmasis23/pip-note/actions/runs/37292452629); its independent bundle job was still running when the first installer became available. The existing [Windows workflow run 37292452529](https://github.com/Jmasis23/pip-note/actions/runs/37292452529) successfully built and uploaded `Pip_0.2.44_x64-setup.exe`. That workflow stamps the build number into the version. Both runs use source commit `0c510c62f3277357ff1d2c79764d8c35f4670d47`, whose tree matches the verified local implementation. Later documentation-only commits do not alter that installer’s code.

The delivered archive is `Pip-Windows-installer.zip` (2,592,154 bytes). Its SHA-256 matches GitHub’s artifact digest: `33150633f49285f6ded4fce4a74af036e7f886c168f4dafc0a484c3f95b51050`. ZIP CRC validation passed and its executable has a valid Windows PE signature. The installer was not executed here and is unsigned. No release was published.

Signing, publishing, updates and the deferred OCR/voice/cloud/AI extensions remain outside this delivery. Further data and runtime limitations are listed in [COMPANION.md](COMPANION.md).
