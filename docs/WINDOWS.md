# Pip for Windows

Tauri 2 shell around the React app. Everything the web view cannot or should not do lives in Rust.

## Layout
- `src/` React app (Desk UI). Runs in a plain browser too (`npm run dev`).
- `src/native.ts` the only place the web app talks to Rust. In a browser it falls back to localStorage and downloads.
- `src-tauri/src/lib.rs` window, tray, single instance, global hotkey, storage/AI/export commands.
- `src-tauri/src/shake.rs` system-wide shake: a low-level **mouse** hook (no keyboard hook) feeding `pip_core::gesture`.
- `src-tauri/core/` logic with no Tauri dependency, unit tested on any OS: shake detector, atomic file store, OpenAI-compatible client, key storage.

## What lives where
- Notes: files in `%APPDATA%\com.jmasis.pip\store\` (atomic temp+rename writes). The web view only holds them in memory.
- AI key: Windows Credential Manager (service `com.jmasis.pip`). The endpoint is saved in Rust; the web view cannot read the key or redirect requests. Calls are made from Rust, so there is no CORS problem with Ollama.
- Closing the window hides it to the tray so the shake and Ctrl+Shift+Space keep working. Quit from the tray menu.

## Build
- CI: `.github/workflows/windows.yml` runs web tests, Rust core tests, then builds an unsigned NSIS installer on `windows-latest` and uploads it as the `Pip-windows-installer` artifact.
- Locally on Windows: install Node 20 and Rust, then `npm ci && npx tauri build`.

## Not done
Code signing (SmartScreen will warn on an unsigned installer), launch at login, auto-update, SQLite (storage is JSON files for now).
