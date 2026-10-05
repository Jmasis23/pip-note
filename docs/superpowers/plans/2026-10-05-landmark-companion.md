# Pip Landmark Companion Implementation Plan

> **For agentic workers:** Execute inline with executing-plans; review the full branch before delivery.

**Goal:** Build the local-first Windows companion from the October 5 user brief.
**Architecture:** Reuse the existing Tauri 2 / React 18 code and portable Landmark engine. Keep native input, recognition, storage and UI dispatch separate. SQLite transactions acknowledge saves and reject stale cross-window snapshots.
**Tech Stack:** Tauri 2, Rust stable, React 18, TypeScript, Vite, SQLite via rusqlite.
**Spec:** docs/superpowers/specs/2026-10-05-landmark-companion.md

## Global Constraints
- Gesture opens only a compact tool, never the dashboard.
- “Need it later? Pip it.” and “Keep it.” No account or AI transmission.
- Clipboard, startup and notifications opt in; no arbitrary code execution.
- Preserve original data; do not claim Windows behavior from browser tests.

## Review Focus
- Concurrent edits from floating and main windows must reject stale writes.
- Corrupt storage must stop loading rather than silently create an empty library.
- Display scale/position changes must invalidate candidates and flag affected regions.
- Continuous motion and cooldown must not carry completed strokes into a new gesture.
- Missing shortcut originals and cancelled dialogs must preserve capture drafts.

### Task 1: Native activation
- [x] Reuse the existing Landmark branch, then add regression sequences for bounded movement, suppression reset and cooldown.
- [x] Remove shake-anywhere fallback, bound hook work, add exclusions, pause, and lifecycle cleanup.
- [x] Dispatch all assigned tools to compact windows with physical work-area placement.
- [x] Add monitor overlays and unsaved layout testing. Run portable gesture/model tests and Windows cross-check.

### Task 2: Durability
- [x] Test SQLite restart, CAS, corrupt import and backup behavior before implementation.
- [x] Add SQLite store migration and transactions; preserve old file stores.
- [x] Add a typed local content repository with acknowledged writes, drafts, import/export, backups and revision conflicts.
- [x] Run core and repository suites.

### Task 3: Tools and interface
- [x] Test snippet fields, timezone DST, import validation and content capture.
- [x] Implement capture, recall, clipboard controls, snippets, shelves, references, follow-ups, resume cards and safe utilities sequentially.
- [x] Add main navigation, onboarding and explicit preferences; remove authentication/AI from runtime entry.
- [x] Deliver cursor SVG variants/states and compact accessible ivory/charcoal interface.
- [x] Verify frontend journeys, keyboard navigation, reduced motion, typecheck and build.

### Task 4: Delivery
- [x] Run complete frontend/Rust checks; configure Windows CI without automatic publishing.
- [x] Review complete diff, resolve material findings, record limits and Windows acceptance matrix.
- [x] Commit source and documentation on the feature branch; provide setup and artifact links.

## Execution outcome

The four implementation slices and a read-only branch review are complete. See `docs/VERIFICATION.md` for final evidence. Windows runtime acceptance and rendered visual inspection remain blocked by this environment. The local installer build failed, but a Windows GitHub Actions run successfully produced the delivered installer; archive integrity and PE headers were checked. Source is preserved on `feat/landmark-companion`, with no merge or release publication.
