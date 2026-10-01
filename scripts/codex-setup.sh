#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

for required in node npm cargo rustc; do
  if ! command -v "$required" >/dev/null 2>&1; then
    printf 'Required runtime missing: %s. Configure Node 22+ and Rust stable in the environment.\n' "$required" >&2
    exit 1
  fi
done

node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node 22+ required"); process.exit(1); }'
node --version
npm --version
rustc --version
cargo --version

if [[ -f package-lock.json ]]; then
  npm ci
elif [[ -f package.json ]]; then
  printf 'package.json exists without package-lock.json; commit a lockfile before using reproducible setup.\n' >&2
  exit 1
else
  printf 'Design-only repository: no frontend dependencies to install yet.\n'
fi

if [[ -f src-tauri/Cargo.lock ]]; then
  cargo fetch --locked --manifest-path src-tauri/Cargo.toml
elif [[ -f src-tauri/Cargo.toml ]]; then
  printf 'Rust application exists without Cargo.lock; commit its lockfile before using reproducible setup.\n' >&2
  exit 1
fi

printf 'Pip development prerequisites checked. Windows native tests are a separate step.\n'
