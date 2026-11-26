#!/usr/bin/env bash
set -euo pipefail

# Install or symlink Swarm Forge into Antigravity's global plugins directory
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${HOME}/.gemini/config/plugins/swarm-forge"

mkdir -p "$(dirname "$TARGET_DIR")"

if [[ "${1:-}" == "--link" ]]; then
  rm -rf "$TARGET_DIR"
  ln -s "$REPO_DIR" "$TARGET_DIR"
  echo "[Swarm Forge] Symlinked $TARGET_DIR -> $REPO_DIR"
else
  rm -rf "$TARGET_DIR"
  mkdir -p "$TARGET_DIR"
  cp -R "$REPO_DIR/plugin.json" "$REPO_DIR/hooks.json" "$REPO_DIR/README.md" \
        "$REPO_DIR/assets" "$REPO_DIR/rules" "$REPO_DIR/scripts" "$REPO_DIR/skills" \
        "$TARGET_DIR/"
  chmod +x "$TARGET_DIR/scripts/session_start.sh" \
           "$TARGET_DIR/scripts/detect_env.mjs" \
           "$TARGET_DIR/scripts/run_cli_review.mjs" \
           "$TARGET_DIR/skills/ts-repo-wiki/scripts/scan_ts_graph.mjs" \
           "$TARGET_DIR/skills/arch-best-practices/scripts/find_gold_repos.mjs"
  echo "[Swarm Forge] Installed to $TARGET_DIR"
fi
