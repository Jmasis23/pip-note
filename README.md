# Pip — Windows desktop companion

**Need it later? Pip it.**

Pip uses invisible monitor-relative Landmarks: cursor location selects a tool and a deliberate wiggle opens its compact window. The dashboard opens intentionally. This branch implements the local-first companion; it does not require an account or load the former cloud/AI runtime.

## Run and build

Prerequisites: Node 22+, Rust stable, Windows 11 x64, Microsoft C++ Build Tools with Desktop development with C++, and WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run tauri dev
```

Browser interface only: `npm run dev`. The browser cannot detect background mouse movement, use the native tray, or prove native popup focus.

```sh
npm run lint
npm run format:check
npm test
npm run build
cargo test --manifest-path src-tauri/core/Cargo.toml --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
npm run tauri build
```

Windows installers appear under `src-tauri/target/release/bundle/nsis/`. The companion CI workflow builds an unsigned installer artifact without publishing a release. Native interactive acceptance is still required.

## First success

1. Open Landmarks. Use presets or draw a rectangle; name it and select Quick Capture.
2. Save, or use full-monitor setup and Test wiggle to test unsaved regions through the actual native recognizer. During tests Pip reports the assigned tool instead of opening it.
3. Leave setup, focus an ordinary Windows application, and wiggle within the region.
4. Write your thought and choose **Keep it**. Find it in Library or Quick Recall.
5. Pause from the sidebar or tray. Ctrl+Shift+Space captures; Ctrl+Shift+P opens the compact tools menu.

Landmarks are invisible and do not intercept clicks during ordinary use. Disable all Landmarks to disable gesture activation; there is no shake-anywhere fallback.

## Local tools

Capture notes, checklists, links, pasted images and file attachments; recall/search/filter; optional clipboard history; template snippets; project shelves; floating references; due/waiting follow-ups; resume cards; calculator, word count, cleanup and time-zone conversion.

Main navigation: Library, Projects, Snippets, Follow-ups, Landmarks, Settings. Light/charcoal/system modes, reduced motion and optional mascot. Drafts are stored per window and appear under Unfinished thoughts.

Clipboard collection, startup and notifications are explicit preferences. A managed attachment copy remains with Pip; a shortcut depends on its original file. Executable attachments are not launched. Export/import contains content and attachment references, not file bytes. Reminders work while Pip is running or closed to the tray; fully quitting stops them until restart.

## Durability and privacy

SQLite in the per-user app data directory; acknowledged transactions, cross-window compare-and-swap and item revisions. Existing file stores are copied into SQLite without deleting originals. Legacy text, checklists and pasted images migrate to the new library. No remote note upload, account, telemetry, OCR, voice, cloud sync or AI runtime. Local storage is not encrypted.

Settings provides JSON export/import and SQLite backup/restore. Restore validates application data before replacing the database and reloads clipboard/gesture runtime state. Daily backups use SQLite’s backup API; seven daily copies are retained, while manual backups remain until removed. Trash and permanent-delete controls affect live content; backup copies retain deleted content until their retention expires or they are removed.

See [architecture and limitations](docs/COMPANION.md), [verification results](docs/VERIFICATION.md) and [Windows acceptance steps](docs/WINDOWS.md). SVG branding is in `public/brand/`.
