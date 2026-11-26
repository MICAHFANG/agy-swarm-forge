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

CFG_MSG=""
if [ -f "$WS/.agents/swarm-forge.json" ]; then
  CFG_MSG=" 已加载项目级模型分工配置 ($WS/.agents/swarm-forge.json)。"
elif [ -f "$HOME/.gemini/config/swarm-forge.json" ]; then
  CFG_MSG=" 已加载全局模型分工配置 ($HOME/.gemini/config/swarm-forge.json)。"
else
  CFG_MSG=" 尚未配置各阶段模型路由，首次初始化时请运行 detect_env.mjs 探测本机 Coding CLI 并用 ask_question 让用户自选。"
fi

if [ -f "$WS/.agents/wiki/INDEX.md" ]; then
  MSG="[Swarm Forge] 当前工作区已存在项目知识库与图谱索引 ($WS/.agents/wiki/INDEX.md、PITFALLS.md 及 _generated/COMPONENT_INDEX.md、MODULE_GRAPH.md)。${CFG_MSG}涉及功能开发、组件修改或定位代码时，请优先查阅它们以复用现有组件变体并规避历史高频踩坑点。"
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg m "$MSG" '{injectSteps:[{systemMessage:{systemMessage:$m}}]}'
  else
    printf '{}\n'
  fi
  exit 0
fi

if [ -f "$WS/tsconfig.json" ] || [ -f "$WS/package.json" ]; then
  MSG="[Swarm Forge] 检测到当前工作区为 JS/TS 项目，尚未初始化 .agents/wiki/ 图谱索引。${CFG_MSG}在首次执行初始化或跨文件开发时，请激活 ts-repo-wiki 技能完成 AST 图谱扫描与模型路由向导。"
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg m "$MSG" '{injectSteps:[{systemMessage:{systemMessage:$m}}]}'
  else
    printf '{}\n'
  fi
  exit 0
fi

printf '{}\n'
