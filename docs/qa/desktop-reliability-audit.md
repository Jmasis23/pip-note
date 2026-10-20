# Desktop reliability audit

This change fixes reproduced persistence and desktop interaction bugs without changing the dashboard, dock appearance, AI configuration, or landing site.

## Confirmed regressions

- Typing during a pending autosave could be marked saved without the newer edit reaching storage. One writer now drains newer edits using the acknowledged revision.
- A clean editor updated by another window refreshed its data but left the uncontrolled rich-text surface showing the old body. Only externally changed documents now reseed that surface.
- Closing quick capture before its debounce finished could read a blank stored note and delete it. Close now awaits the editor's durable save, including Esc and Ctrl+Enter. Save failures retain the text and permit retry.
- Repeated shake/shortcut triggers remounted an active capture and cleared its visible text. They now focus the existing capture; a completed dismissal creates a new capture on next open.
- Markdown export could read old content before a pending save completed. It now awaits a successful save.
- Capture close treated a failed verification read as an empty note. Read/cleanup errors now keep the popup open with a retryable error.
- Editor color and selection popovers outside the note panel were omitted from the shaped native window. Their rectangles now participate in the native hit region.

## Automated validation

- `npm test`: 99 tests passed across 19 files. Tests use delayed real repository writes and injected storage failures to reproduce the save/close races; existing gesture, capture resize, repository, sync, AI planning, and dock tests also pass.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `cargo check --tests --manifest-path src-tauri/Cargo.toml`: passed with local GNU compiler helpers.
- `cargo test --manifest-path src-tauri/core/Cargo.toml`: 36 passed, doc tests passed (0 tests).
- `cargo test --lib --manifest-path src-tauri/Cargo.toml`: compiled but the local GNU test executable could not start (`0xc0000139`, `STATUS_ENTRYPOINT_NOT_FOUND`). Native test execution remains unverified locally; the PR's Windows MSVC job runs this command.
- `git diff --check`: passed. No Rust source changes; no frontend lint script exists.

Native test execution and Windows CI status are reported in the pull request. Browser/jsdom tests do not establish native Windows behavior.

## Windows validation still required

- Type into capture and immediately close with Esc, Ctrl+Enter, or the close button. Reopen the dashboard and verify the complete note; blank capture should leave no note.
- Repeatedly shake/press the capture shortcut while typing. The same text should remain; after dismissal, the next open should start fresh.
- Edit the same note from the dashboard and a floating window. A clean editor should show the new body, while unsaved concurrent edits should retain conflict recovery.
- Export Markdown immediately after typing; verify the file contains the latest title/body.
- Check color and selection popovers from the desktop dock, including areas extending outside the note panel.
- Confirm orange tabs, pinned panels, tray operation, monitor transitions, display scaling, focus, and fullscreen suppression still behave as before.

The audit does not claim exhaustive bug elimination or live desktop validation. The existing main-window destroy/quit paths still do not provide a general save-failure veto; this change adds explicit save protection to editor actions and capture dismissal.
