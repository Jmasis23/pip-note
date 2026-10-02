# Pip

Thought it? Keep it.

A Windows-first desktop notes companion with an original lavender cursor mascot.

## Project status

Web app implemented on branch `feature/pip-app`: capture, library, editor, checklists, search, pin, trash, export, backups, settings, light/dark. Runs in a browser with local storage. The Windows shell (Tauri 2 + Rust SQLite bridge, tray, global shortcut, NSIS installer) is NOT built yet and needs a Windows runner. Source lives in the private `Jmasis23/pip-note` GitHub repository. A Codex cloud environment has not yet been configured or validated.

## Product specification

Read [the Pip design](docs/superpowers/specs/2026-10-01-pip-windows-design.md) before planning or implementing the application. It defines quick capture, drafts, local SQLite storage, search, pinned notes, checklists, floating windows, backups, and export.

## Development direction

- Desktop shell: Tauri 2 / Rust.
- Interface: React / TypeScript / Vite.
- Persistence: SQLite through typed Rust commands.
- Brand: Pip; cream, ink, lavender, mint, and peach.
- Platform: Windows 11 x64 first.

Use the [Codex environment handoff](docs/CODEX-ENVIRONMENT.md) when connecting this repository to Codex. A Linux container supports development and portable checks; Windows desktop integration and installer validation must run on Windows.

## Run

```bash
npm ci
npm run dev      # http://localhost:1420
npm test         # 10 persistence tests
npm run build
```

Storage sits behind `src/repo/repo.ts` (`NoteRepo`). The browser build uses localStorage; the Tauri build should supply a SQLite-backed implementation of the same interface.
