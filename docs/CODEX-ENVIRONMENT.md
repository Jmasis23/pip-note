# Pip — GitHub and Codex handoff

## Target

- GitHub owner: Jmasis23, verified through the connected GitHub account.
- Repository: `Jmasis23/pip-note`, verified through the connected GitHub account.
- Visibility: private.
- Default branch: main.
- Codex environment name: Pip Windows Notes.

The private GitHub repository exists. The user created it and supplied its URL. Uploading the handoff uses the authenticated GitHub connector; browser sign-in is not required. The Codex environment name remains a proposed target until setup is completed and validated in Codex.

## Repository contents

The design specification, project instructions, reproducible setup script, and optional devcontainer configuration are included. No product source code is included. `AGENTS.md` carries the agreed brand and project constraints into Codex.

## Codex configuration

Select the GitHub repository after it has been created and is accessible to Codex. Use Node 22 or later and Rust stable. Where the environment supports a manual setup command, use:

```bash
bash scripts/codex-setup.sh
```

The script verifies runtimes and installs only committed frontend dependencies using `npm ci`; it fetches Rust dependencies only with a committed Cargo.lock. It intentionally stops on missing runtimes or missing lockfiles instead of pretending setup succeeded. No secrets are needed for the initial local-only app.

The optional `.devcontainer/devcontainer.json` is for compatible Codespaces or VS Code devcontainers. It is not itself a Codex environment and should not be described as one. Its image and features must be pulled and tested before claiming that this environment starts successfully.

If native Linux Tauri compilation is needed, provision the prerequisites in Tauri's current Linux documentation, including WebKit GTK development libraries. Do not infer that the devcontainer already includes those libraries. Portable Rust persistence tests and frontend tests can be developed independently of desktop-shell compilation.

## First Codex task

Read AGENTS.md and the Pip specification. Prepare an implementation plan for the Windows-first Tauri 2 application using the selected Pip design. Preserve the specification's quick-capture and draft behavior, SQLite revision conflict handling, local backups, and accessibility requirements. Follow the user-requested Superpowers planning review before product implementation. Begin with a testable persistence and capture slice; do not add cloud sync, AI, code execution, or payments. Use actual useLayouts source only after inspecting licensing and dependencies. Report Windows-only checks separately from portable checks.

## Validation before marking setup complete

1. Confirm the private repository is `Jmasis23/pip-note` (verified during handoff).
2. Upload these files and verify their contents on the main branch.
3. Connect the repository to Codex and verify its access scope without broadening access to unrelated repositories.
4. Create the Codex environment, run its setup, and verify the resulting status.
5. Submit the first planning task and verify it uses this repository and AGENTS.md.

For Windows installer work, use a Windows build environment with the official Tauri prerequisites. Do not report a Windows installer as working based on a Linux development environment.

## Official references

- Codex environment documentation: https://learn.chatgpt.com/docs/environments/cloud-environment
- Tauri prerequisites: https://v2.tauri.app/start/prerequisites/
- Tauri Windows installer: https://v2.tauri.app/distribute/windows-installer/

The fetched Codex page identifies itself as legacy and links to the current cloud-environment experience. Verify the actual account's settings interface before configuring an environment; do not assume legacy setup options exist in every current account.
