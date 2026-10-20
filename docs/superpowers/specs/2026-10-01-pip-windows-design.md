# Pip — Windows app design

Date: 2026-10-01
Status: Ready for user review. Pip branding and Windows-first direction are selected; this written product specification has not yet been approved.

## Intended outcome

Pip is a small desktop notes companion for people who need to catch a thought without leaving their current task. Press a shortcut, write, save locally, and return to work. The selected brand is playful precision: a cute lavender arrow cursor, cream surfaces, clear typography, and restrained feedback.

User decisions: Windows first; original cursor character; Pip visual direction; useLayouts Design; Superpowers workflow. Implementation assumptions: Windows 11 x64 first, offline use without an account, one personal workspace, no paid plan in the first build. Windows 10 and ARM64 compatibility are future validation targets, not release claims.

## Implementation approach

Recommended: Tauri 2 desktop shell, React with TypeScript and Vite for UI, Rust commands for persistence and Windows integration, SQLite stored in the operating system's per-user application-data directory. React permits actual source adaptations from useLayouts. Tauri provides documented global-shortcut and system-tray integration.

Alternatives considered: WinUI 3 offers native Windows controls but requires translating React interactions; Electron offers the same React flexibility with a bundled Chromium runtime. Tauri best fits the selected UI direction and desktop utility scope. The UI runs in the Windows system WebView; it is not a WinUI app.

## First version

- Quick-capture window, opened by Ctrl+Shift+Space or tray menu. Focus the editor immediately. The shortcut is configurable; conflicts show a clear message without claiming registration succeeded.
- Explicit Ctrl+Enter / “Keep it” commits a quick note. An unfinished capture is retained as a local draft when dismissed; Esc hides the panel and returns to the previous task. The next capture restores that draft. Show “Draft kept” only after persistence succeeds.
- Note library with All notes, Today, Pinned, and Trash views; title and body search; newest edited first. Today means created or edited on the current local calendar day. Search combines with the selected view.
- Note editor for plain text and structured checklists. Existing-note edits autosave after a short debounce and on focus loss; the window is not destroyed while a save is pending.
- Pin and unpin; recoverable trash and restore; permanent deletion only through a clearly labeled confirmation. No automatic trash purging.
- Floating note windows, optionally always on top. Closing a floating window leaves its saved note intact. One floating window per note; repeated requests focus it.
- Settings for global shortcut, light/dark/system theme, reduced motion, and optional launch at sign-in, disabled initially.
- Export all active notes as a versioned JSON file and each individual note as Markdown. Use a Windows save dialog; cancellation leaves data untouched.
- Daily local SQLite backups, created through SQLite's backup API rather than copying an open database. Keep the latest seven successful daily backups. User-initiated restore closes editors, backs up the current database, validates the selected backup, and then replaces it.

Later: drawing boards, math scratchpad, cloud sync, rich text, code execution, AI features, subscriptions, and mouse-shake activation. No background clipboard collection in this version.

## Pip design system

Light: cream #FAF8F3 background, white #FFFFFF surfaces, ink #20232B text, lavender #858CFF brand fill, pale lavender #EEEDFF selected surfaces, mint #BCEBD8 and peach #FFD3BB supporting accents. Use ink labels on lavender buttons; do not use lavender for small text on cream.

Dark: #191C25 background, #242936 surfaces, #F4F3FA text, #B0B5FF active accents, #383D60 selected surfaces. Verify contrast against the actual surfaces; normal text must meet WCAG AA 4.5:1.

Typography: Segoe UI Variable with Segoe UI and sans-serif fallbacks. A custom rounded Pip wordmark is a brand asset, not a required paid font. Use 14–16 px interface text, clear headings, 8 px spacing increments, 12–16 px surface radii, and 2 px icons on a consistent grid.

The main window uses a compact sidebar, a searchable note list, and an editor. The capture panel has a title bar, cursor mark, text input, visible draft/save status, and one primary action. Floating notes prioritize content. Window resizing reflows without clipping at 640×480; the capture panel supports 360 px width. Standard Windows window controls and keyboard navigation remain available.

The arrow mascot has an asymmetric rounded silhouette, two small eyes, and a folded tail. Provide SVG source, Windows ICO assets, and simplified 16/24/32 px tray variants. Mascot states: idle, capturing, saving, saved, error. A success nod runs only after confirmed persistence. Error feedback includes text and a retry action. Reduced motion replaces movement with static state changes. Mascot animation never replaces the system pointer or obstructs input.

Copy: “Need it later? Pip it.” / “Something on your mind?” / “Keep it” / “Got it. Saved.” / “Couldn't save. Your text is still here.”

## useLayouts integration

Adapt the verified Discrete Tabs source for All notes, Today, and Pinned navigation where suitable, retaining its Motion layout spring and active-label transition. Replace clickable containers with native buttons, retain accessible labels, and keep selected state readable without animation. Use custom Pip components for capture and saving feedback rather than claiming those are registry components. Inspect the current source and license before copying; preserve required notices and record provenance. Bundle components and fonts locally; production must not depend on a CDN.

## Component and data boundaries

- Desktop shell owns tray actions, shortcut registration, single-instance behavior, window focus, window placement on the active display, and application quit.
- Repository owns schema migrations, transactions, note validation, drafts, export snapshots, backups, and restore.
- React UI calls a typed bridge and renders acknowledged state; it cannot run arbitrary SQL or arbitrary shell commands.
- Shared note events keep the library and floating windows current. Every edit carries a revision; stale writes return a conflict rather than overwriting newer content. The UI retains unsaved text and offers to reload the latest note or save its text as a separate note.
- SQLite stores notes with UUID, title, text/checklist content, timestamps, pinned state, deletion timestamp, and revision; checklist items have stable IDs, text, completion state, and order. Drafts and preferences are separate records. Schema changes are versioned.

All data remains on the PC in this version. No account, remote note service, telemetry, or automatic content transmission. Local storage is not advertised as encryption. Restrict desktop bridge permissions to the app's needs and disallow loading arbitrary remote content in app windows.

## Lifecycle and failure behavior

Closing the main window minimizes Pip to the tray; the tray provides Open, New note, and Quit. Quit flushes pending writes and reports failures before allowing the user to discard unsaved content. Explicit draft saving covers capture dismissal. Opening a second instance focuses the existing app.

The editor keeps text when a write fails. Storage errors must not display “Saved.” Migration failure preserves the old data and shows recovery options. Shortcut failure preserves tray access. An unavailable backup destination reports failure without deleting the previous backup. Changes to deleted notes require restoration first.

## Acceptance and verification

1. Capture a note from another Windows application using the global shortcut, save, dismiss, and find it after restarting Pip.
2. Dismiss an unfinished capture and verify that its draft reappears, including after restart.
3. Search title/body, filter pinned notes, edit checklists, trash/restore, and export with Unicode, emoji, quotes, and multiline content preserved.
4. Edit the same note in the library and a floating window; verify notifications and conflict handling prevent silent overwrites.
5. Simulate a failed save: text remains available, the mascot shows error, and success is never falsely reported.
6. Verify daily backups and restore preserve note IDs, revisions, checklist state, and preferences. Corrupt backups are rejected before replacement.
7. Verify keyboard-only operation, visible focus, screen-reader labels, light/dark contrast, reduced motion, 100%/150%/200% display scaling, and multi-monitor window placement.
8. Run focused persistence and lifecycle tests, frontend type checks and production build, Rust checks, and a Windows desktop smoke test. Package the first build as a Windows NSIS installer after native validation.

The current execution workspace is not a Windows machine. Browser/UI checks and portable tests cannot certify tray behavior, shortcut registration, window focus, or installer operation. A Windows build and smoke test are required before calling the app ready to install. Signing and Microsoft Store publishing are separate release work; no signed installer is promised without signing access.

## Sources and review

- Tauri prerequisites: https://v2.tauri.app/start/prerequisites/
- Global shortcut: https://v2.tauri.app/plugin/global-shortcut/
- System tray: https://v2.tauri.app/learn/system-tray/
- Windows installer: https://v2.tauri.app/distribute/windows-installer/
- useLayouts Discrete Tabs source inspected in this conversation: https://uselayouts.com/r/discrete-tabs.json

Self-review completed: selected brand preserved; feature scope separated from later capabilities; persistence acknowledgments and draft handling explicit; platform validation limits stated; no unresolved placeholders. Next stage after written-spec approval: implementation plan, then build and verification.
