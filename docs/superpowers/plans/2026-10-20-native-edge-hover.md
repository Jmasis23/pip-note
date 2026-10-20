# Native edge hover implementation plan

Goal: expose the existing FolderRail and Editor outside the dashboard while preserving capture and tray operation.

Architecture: a single transparent, frameless desktop companion webview renders FolderRail with the existing repository and Editor. A Windows window region follows visible UI rectangles so the uncovered desktop stays clickable. A Rust 25 ms cursor sampler owns physical monitor/work-area placement, fullscreen suppression, edge latches, and a 450 ms hide grace. Top hover reveals the actual main window without hover focus theft; ordinary click focus remains available.

Constraints: no landing changes, no AI/provider/credential changes, no redesign, no new dependencies, feature branch only. Base is windows/pip-app (main has no desktop source); describe inherited app history in the main-targeted PR.

1. Write and run failing Rust policy tests for edge entry, grace, monitor crossing, fullscreen, held buttons, top rearm, and retained panels. Implement pure policy then the native host and startup lifecycle.
2. Write and run failing cross-window repository tests. Add native compare-and-set commits and serialized repository operations with refresh/retry, preserving revision conflicts and broadcasting successful persistence.
3. Reuse FolderRail/Editor in DesktopDock, report rendered hit regions, retain floating/pinned panels, and remove the in-dashboard rail only on native Windows. Add focused UI/lifecycle tests and a subtle reduced-motion-aware dashboard reveal.
4. Run Rust backend/core tests, Vitest, typecheck, production build, focused formatting checks. Inspect the requested hosted preview routes, document Windows QA and actual limitations, review, commit, push and create PR to main.

Review focus: mixed DPI and negative monitor coordinates; desktop click-through during animations; edits racing between webviews; focus while switching applications; fullscreen and tray startup. Policy and storage tests cover deterministic contracts; interactive Windows behavior requires manual QA.
