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

if [ -f "$WS/.agents/wiki/INDEX.md" ]; then
  MSG="[Swarm Forge] 当前工作区已存在项目知识库与图谱索引 ($WS/.agents/wiki/INDEX.md 及 _generated/COMPONENT_INDEX.md、MODULE_GRAPH.md)。涉及功能开发、组件修改或定位代码时，请优先查阅它们以复用现有组件变体与模块架构。"
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg m "$MSG" '{injectSteps:[{systemMessage:{systemMessage:$m}}]}'
  else
    printf '{}\n'
  fi
  exit 0
fi

if [ -f "$WS/tsconfig.json" ] || [ -f "$WS/package.json" ]; then
  MSG="[Swarm Forge] 检测到当前工作区为 JS/TS 项目，但尚未初始化 .agents/wiki/ 图谱索引。在首次执行跨文件功能开发或重构时，请激活 ts-repo-wiki 技能运行扫描脚本建立组件变体与依赖图谱。"
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg m "$MSG" '{injectSteps:[{systemMessage:{systemMessage:$m}}]}'
  else
    printf '{}\n'
  fi
  exit 0
fi

printf '{}\n'
