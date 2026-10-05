# Pip companion architecture

## Boundaries

| Module | Responsibility |
|---|---|
| `src-tauri/src/shake.rs` | WH_MOUSE_LL on its own message thread; bounded sample queue; foreground exclusions/full-screen policy; native recognizer worker; startup status and unhook |
| `src-tauri/core/src/landmarks.rs` | Portable normalized region validation, display reconciliation, locked candidates, distance-qualified reversals, bounded movement, cooldown and fresh gesture |
| `src-tauri/src/lib.rs` | Desktop lifecycle, tray/shortcuts, physical work-area placement, compact dispatch, setup overlays, typed commands, reminders and backups |
| `src-tauri/core/src/sqlite.rs` | SQLite WAL/FULL transactions, compare-and-swap, migration, online backup and validated restore |
| `src-tauri/src/clipboard.rs` | Opt-in Windows text/image collection, pin/retention/exclusion policy, explicit copy and cleanup |
| `src/companion/model.ts` | Versioned content schema, validation, item revisions, per-window drafts, snippets and time-zone conversion |
| `src/companion/storage.ts` | Desktop bridge versus explicitly limited browser storage, legacy import and export |
| `src/companion/ToolPanel.tsx` | Compact tools, acknowledged saves, recoverable errors and draft preservation |
| `src/companion/App.tsx` | Intentional main application, library/project organization, preferences and recovery |
| `src/landmarks/` | Region editor, presets, conflict explanations, fullscreen setup and native test routing |
| `public/brand/` | Original folded arrow mascot, SVG wordmarks, symbols, tray and five state variants |

The SQLite table contains versioned JSON records. This preserves the existing data seam while providing genuine SQLite durability; the frontend cannot issue SQL. Content snapshots use native compare-and-swap and items use revisions. Conflicting writes retain local input and offer a separate-copy action. Drafts have owners and stale clears are rejected.

The Windows hook does not perform database, foreground-process, animation or WebView operations. Samples enter a bounded nonblocking queue. The worker applies exclusions and suppression and feeds the portable engine. Activation only targets `tool`; reference windows have their own labels. The main window is never dispatched by a gesture.

Native regions are physical monitor coordinates derived from normalized fractions. Negative origins are supported. Resolution changes retaining aspect ratio preserve regions; aspect, position or scale changes and disconnection flag them for explicit review. Stale editor snapshots are rejected. Monitor identity uses the display name reported by Tauri, with an enumerated fallback.

## Dependency and source decisions

Existing compatible React 18.3.1, Vite 5.4.21 and Tauri 2.12.1 were retained. New rusqlite 0.40.2 uses bundled SQLite and online backup. Tauri 2 dialog/opener plugins are called from explicit Rust commands; no frontend shell/filesystem/HTTP capability is granted. ESLint 10 and TypeScript ESLint support the installed Node runtime. Lockfiles record exact resolved versions.

Official Tauri, rusqlite and Microsoft hook documentation were consulted. BoardUI’s landing page identifies React 19.2/Tailwind 4 but its docs endpoint was unavailable. useLayouts documentation was readable, but the selected registry source could not be fetched. No source from either was copied or installed. Custom components implement the compact visual system. The existing vendored Ionicons retain their MIT license.

## Precise limits

- Real Windows input, tray, clipboard, focus, monitor hotplug and mixed-DPI journeys remain unexecuted here. Cross-compilation is not those tests.
- Gesture thresholds are physical-pixel tuning candidates (36 px travel, four reversals, 800 ms window, 24 px tolerance, 1200 ms cooldown). The default movement span is bounded to 240 px. Users may need to tune for display scale and hardware.
- Global hooks do not establish secure desktop/UAC coverage. Injected movement is ignored. Process suppression is sampled on the recognition worker rather than guaranteed instantaneous during a focus transition.
- Display names are not hardware EDID identities; Windows renaming or reordering fallback displays can require review.
- Clipboard text and images have bounded pools and a total image budget; configured unpinned retention is 10–50 items / 1–90 days. Pins have their own cap. Sensitive clipboard detection is imperfect.
- Content is plain text with structured checklists; legacy rich formatting becomes plain text, with original legacy files preserved and embedded images imported.
- JSON exports carry attachment references, not attachment bytes. Moving the export to another PC requires transferring file copies separately. Missing originals produce an explicit error. Removed attachment references do not immediately garbage-collect every managed file.
- Drafts autosave after 500 ms; an abrupt process kill inside that interval can lose the last keystrokes. Normal Escape/close waits for draft persistence. No OS shutdown recovery contract is claimed.
- Notifications may be delayed by Windows notification policy or sleep. Fully quitting Pip stops reminders; overdue tasks are handled after restart.
- Deleted content can remain in local backups and preserved legacy files. No encryption, signed release, updater, cloud sync, OCR, transcription, meetings or AI is shipped in this runtime.
