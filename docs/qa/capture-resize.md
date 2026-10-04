# Capture resize candidate

Change: resizable native capture window, fixed header/footer, internally scrolling text,
single-line title preview, and monitor work-area clamps. Default: 600x330 logical pixels;
minimum 360x280, maximum 1000x800, reduced as needed to fit the monitor work area.
All eight edges/corners resize; header drags. No restart size persistence was added.

Verified locally:
- npm test: 59 tests passed.
- npm run build: TypeScript and production frontend build passed.
- rustc --test src-tauri/src/capture_bounds.rs: 5 tests passed.
- Browser regression with 98,449 characters, including a 10,000-character unbroken
  line: actual paste event/input, scroll to end, 360x280 / 600x330 / 1000x800 resize,
  no horizontal overflow, reachable folder/Keep it, manual folder override,
  Ctrl+Enter, whole-note persistence/reload, Escape draft retention, and clipboard
  panel rendering/search. Zero application exceptions.
- Successful Jev response and failed-service fallback are mocked in browser QA.
  No live account inference or native clipboard access was tested.

To reproduce browser QA: install Playwright without changing production dependencies
(`npm install --no-save --package-lock=false playwright`), set CHROME_PATH if needed,
then run `node docs/qa/capture-resize.browser.mjs`. Output images are in qa-artifacts.
Run from repository root with port 1420 free.

Windows runtime test before production release:
1. Install CI candidate. Shake/hotkey/tray should open capture on the cursor's monitor.
2. Paste a long multi-paragraph note. Title stays one line, text scrolls, Keep it visible.
3. Drag each edge and corner down to minimum and up to maximum. Controls work.
4. Drag toward each desktop boundary: never lose controls behind taskbar or screen edges.
5. If available, move between monitors at 100%/150% DPI and a monitor left of the primary.
6. Save to a folder, confirm note content; test offline/failure fallback and clipboard history.
7. Close/reopen capture: same session size retained. App restart returns to default size.

Local Windows-target cross-compilation could not complete: the Linux environment
has no executable MinGW C compiler. Windows CI must compile the full desktop app;
CI build success alone is not proof of the Windows interactions above.
