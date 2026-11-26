#!/bin/sh
# Fast (<10ms) SessionStart hook: detects .agents/wiki status in the active TS workspace.
PAYLOAD="$(cat 2>/dev/null || true)"
if [ -z "$PAYLOAD" ]; then
  printf '{}\n'
  exit 0
fi

# Extract primary workspace path via jq if available, else python3 fallback
WS=""
if command -v jq >/dev/null 2>&1; then
  WS="$(printf '%s' "$PAYLOAD" | jq -r '(.workspacePaths[0] // .cwd // "")' 2>/dev/null || true)"
fi

if [ -z "$WS" ] || [ ! -d "$WS" ]; then
  printf '{}\n'
  exit 0
fi

CFG_TAG="none"
if [ -f "$WS/.agents/swarm-forge.json" ]; then
  CFG_TAG=".agents/swarm-forge.json"
elif [ -f "$HOME/.gemini/config/swarm-forge.json" ]; then
  CFG_TAG="~/.gemini/config/swarm-forge.json"
fi

if [ -f "$WS/.agents/wiki/INDEX.md" ]; then
  MSG="[Swarm Forge] Wiki: .agents/wiki/INDEX.md, PITFALLS.md, _generated/COMPONENT_INDEX.md | ModelConfig: ${CFG_TAG}"
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg m "$MSG" '{injectSteps:[{systemMessage:{systemMessage:$m}}]}'
  else
    printf '{}\n'
  fi
  exit 0
fi

if [ -f "$WS/tsconfig.json" ] || [ -f "$WS/package.json" ]; then
  MSG="[Swarm Forge] TS repo uninitialized (.agents/wiki/ missing) | ModelConfig: ${CFG_TAG} | Run ts-repo-wiki on first multi-file task."
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg m "$MSG" '{injectSteps:[{systemMessage:{systemMessage:$m}}]}'
  else
    printf '{}\n'
  fi
  exit 0
fi

printf '{}\n'
