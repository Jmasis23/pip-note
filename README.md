# Pip

Thought it? Keep it.

A Windows-first desktop notes companion with an original lavender cursor mascot.

## Project status

Design and environment handoff only. The application has not been implemented, built, or packaged. Source lives in the private `Jmasis23/pip-note` GitHub repository. A Codex cloud environment has not yet been configured or validated.

## Product specification

Read [the Pip design](docs/superpowers/specs/2026-10-01-pip-windows-design.md) before planning or implementing the application. It defines quick capture, drafts, local SQLite storage, search, pinned notes, checklists, floating windows, backups, and export.

## Development direction

- Desktop shell: Tauri 2 / Rust.
- Interface: React / TypeScript / Vite.
- Persistence: SQLite through typed Rust commands.
- Brand: Pip; cream, ink, lavender, mint, and peach.
- Platform: Windows 11 x64 first.

Use the [Codex environment handoff](docs/CODEX-ENVIRONMENT.md) when connecting this repository to Codex. A Linux container supports development and portable checks; Windows desktop integration and installer validation must run on Windows.
