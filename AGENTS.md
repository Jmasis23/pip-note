# Pip project instructions

## Read first

Read `README.md`, `docs/CODEX-ENVIRONMENT.md`, and `docs/superpowers/specs/2026-10-01-pip-windows-design.md`. The companion implementation is on feat/landmark-companion. Read docs/COMPANION.md and docs/VERIFICATION.md for the current architecture and evidence. The original handoff below predates the app.

The user selected Pip and Windows first. Preserve that direction. The next product-development step is a concrete implementation plan against the specification, following the user's requested Superpowers workflow. Do not invent prior approvals or claim that a native build already exists.

## Product and brand

- Capture thoughts without interrupting the current task.
- Use warm ivory #FAF8F3, charcoal #25262B, orange #FF7828, accessible darker orange #AA4100 and restrained pastel surfaces.
- Use Segoe UI Variable, Segoe UI, sans-serif fallbacks.
- Build an original arrow cursor mascot; never copy Grok Bot assets.
- Use the exact primary copy: “Need it later? Pip it.” and “Keep it”.
- Inspect actual useLayouts component source and licensing before adaptation. Prefer accessible native buttons and reduced-motion behavior.
- Bundle production dependencies locally. Do not depend on public CDNs at runtime.

## Architecture and correctness

- Use Tauri 2, React/TypeScript/Vite, Rust, and local SQLite.
- Keep desktop lifecycle, persistence, and interface state in separate modules.
- Expose typed commands; do not let the frontend run arbitrary SQL or shell commands.
- Preserve capture drafts, confirm persistence before success feedback, and reject stale note revisions.
- No account, remote content upload, telemetry or AI runtime. Clipboard history is explicitly opt-in with pause, exclusions, pins and retention.
- Never include credentials, app data, signing material, build caches, or installers in source commits.

## Verification

Use the documented lint, formatting, frontend, portable core and Windows-target checks in README.md. Native acceptance remains distinct from compilation and simulated DOM journeys.

Test restart persistence, failed-save recovery, draft restoration, revision conflicts, Unicode/multiline data, trash/restore, export, and backups. Validate the real Windows shortcut, tray, focus behavior, display scaling, and installer on a Windows runner or machine. Passing browser tests or Linux checks is not proof that the Windows app works.

## Handoff

Work in a feature branch and provide a reviewable diff. Report exactly which checks ran, which passed, and which remain untested. Do not publish a release or claim a signed installer without actual evidence.
