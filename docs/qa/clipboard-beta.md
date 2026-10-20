# Clipboard history and AI Beta labels

Base: windows/pip-app at 6f2ca90 (released as v0.2.16).
Feature branch: feature/ai-beta-clipboard. No remote push or release.

## Behavior
- Beta labels appear only on the main Ask entry points (dock and note mascot)
  and the AI section heading in Settings. No labels on small sub-buttons.
  Existing design tokens preserved.
- Clipboard button in the dock opens history with search, copy, Keep as note,
  delete and clear. Copy does not inject keystrokes into another app; use Ctrl+V.
- Default off. Explicit enable, pause, and clear. Enabled preference survives
  restart. Listener lives in Rust, including when the main webview is unloaded.
- Windows event-driven clipboard listener, not polling. Separate pools: 50 distinct texts plus up to 10 images
  (60 entries total), newest first. Duplicates move to the top. Items over 20,000 characters
  are skipped. Images: up to 10, 4 MiB encoded PNG each, 20 MiB combined
  payload budget, 8 megapixels decoded. Oldest images evicted at the budget, never a text item.
  Text eviction only replaces older text; image slots stay independent.
  Image data URLs add roughly 33% base64 overhead to disk usage.
  Whitespace and Unicode preserved. Initial clipboard not imported.
- Stored in a separate local file, excluded from generic frontend store and sync.
  Unencrypted; warns that secrets may be copied. Honors Windows' clipboard
  exclusion marker where the copying application sets it. No promise to detect
  every password or secret. Pause before copying private content.
- Keep as note explicitly moves selected text into the normal notes store. Such
  notes follow the existing notes sync behavior; raw history never syncs.

## Verification
- TypeScript check + production web build passed.
- 60 web unit tests passed.
- 48 Rust core tests passed, including text and image clipboard tests covering
  default-off, cap, duplicates, Unicode/whitespace/size, serialization and pause,
  independent text/image count and byte eviction, image budgets, old text-only history migration, PNG/DIB roundtrip with alpha,
  bottom-up padded 24-bit DIB and malformed/oversized inputs.
- Browser smoke with mocked clipboard bridge passed: enable/pause, copy,
  Keep as note (image preserved in note rich content), image search, delete, clear,
  Escape, AI labels, narrow viewport.
- Actual rendered screenshots inspected at 1180x780 and 480x740. No clipped
  labels or controls; long history scrolls inside the panel.
- Clipboard module's Rust code typechecked in isolation with a minimal Tauri
  shim, including the Windows FFI branch. This is not native Tauri compilation.
- Full Linux app check blocked by missing glib-2.0 development package.
- Windows cross-check blocked by missing executable MinGW C compiler.

## Before release
Run the existing Windows CI build after approved push. On a real Windows PC:
1. Verify new install defaults off and copies are not recorded until enabled.
2. Enable; copy multiline/Unicode, Snipping Tool screenshots and browser images.
   Inspect newest-first history and thumbnails. PNG, CF_DIB and CF_DIBV5 handled.
   Palette/16-bit/compressed DIBs and file paths are not image imports.
3. Copy text to Notepad; copy image to Paint and a rich editor. Copy publishes
   PNG and CF_DIBV5 for cross-app compatibility. Keep image as note, restart.
4. Pause, copy a secret, verify no new history. Resume and test clear/delete.
5. Close main window to tray, wait for webview unload, copy text, reopen history.
6. Verify restart persistence and clipboard exclusion marker from password apps.
7. Verify shake/hotkey capture still works. No installer produced locally.

PNG codec added as a Rust core dependency. Root Cargo lock refresh also reconciles
pre-existing manifest additions absent from its checked-in lock; no workflow changes.
