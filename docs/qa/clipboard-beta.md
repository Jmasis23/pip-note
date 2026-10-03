# Clipboard history and AI Beta labels

Base: windows/pip-app at 6f2ca90 (released as v0.2.16).
Feature branch: feature/ai-beta-clipboard. No remote push or release.

## Behavior
- AI action buttons show a small Beta label, including Ask, suggestions, apply,
  title/folder, connection and key controls. Existing design tokens preserved.
- Clipboard button in the dock opens history with search, copy, Keep as note,
  delete and clear. Copy does not inject keystrokes into another app; use Ctrl+V.
- Default off. Explicit enable, pause, and clear. Enabled preference survives
  restart. Listener lives in Rust, including when the main webview is unloaded.
- Windows event-driven clipboard listener, not polling. Text only, 50 distinct
  items, newest first. Duplicates move to the top. Items over 20,000 characters
  are skipped. Whitespace and Unicode preserved. Initial clipboard not imported.
- Stored in a separate local file, excluded from generic frontend store and sync.
  Unencrypted; warns that secrets may be copied. Honors Windows' clipboard
  exclusion marker where the copying application sets it. No promise to detect
  every password or secret. Pause before copying private content.
- Keep as note explicitly moves selected text into the normal notes store. Such
  notes follow the existing notes sync behavior; raw history never syncs.

## Verification
- TypeScript check + production web build passed.
- 60 web unit tests passed.
- 39 Rust core tests passed, including four clipboard history tests covering
  default-off, cap, duplicates, Unicode/whitespace/size, serialization and pause.
- Browser smoke with mocked clipboard bridge passed: enable/pause, copy,
  Keep as note, search, delete, clear, Escape, AI labels, narrow viewport.
- Actual rendered screenshots inspected at 1180x780 and 480x740. No clipped
  labels or controls; long history scrolls inside the panel.
- Clipboard module's Rust code typechecked in isolation with a minimal Tauri
  shim, including the Windows FFI branch. This is not native Tauri compilation.
- Full Linux app check blocked by missing glib-2.0 development package.
- Windows cross-check blocked by missing executable MinGW C compiler.

## Before release
Run the existing Windows CI build after approved push. On a real Windows PC:
1. Verify new install defaults off and copies are not recorded until enabled.
2. Enable; copy multiline/Unicode from other apps, inspect latest-first history.
3. Copy history item and Ctrl+V into Notepad; Keep as note and restart Pip.
4. Pause, copy a secret, verify no new history. Resume and test clear/delete.
5. Close main window to tray, wait for webview unload, copy text, reopen history.
6. Verify restart persistence and clipboard exclusion marker from password apps.
7. Verify shake/hotkey capture still works. No installer produced locally.
