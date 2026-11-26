---
name: ts-repo-wiki
description: >-
  构建、刷新和增量维护 TypeScript 项目的 `.agents/wiki/` 双层知识库（基于 TS AST 的组件 Props/Variant
  索引、模块依赖 Mermaid 图谱与业务架构语义 Wiki）。当工作区缺少 `.agents/wiki/`、用户要求生成项目图谱、
  或在完成功能迭代收尾需要同步架构记忆时激活此技能。
---

# TypeScript 仓库图谱与增量 Wiki 技能（`ts-repo-wiki`）

本技能通过“**确定性 AST 图谱（零幻觉、秒级生成） + 增量编译型业务 Wiki（Karpathy `llm-wiki` 模式）**”双层结构，解决大项目找不到既有实现、不知道组件有哪些变体、跨会话失忆的问题。

## 目录结构约定（项目根目录下）

```text
.agents/wiki/
├── INDEX.md                      # 知识库总入口（导航 + 模块职责速览，LLM 增量维护）
├── SYSTEM_PATTERNS.md            # 技术栈约定、状态/请求模式、UI 组件扩展规范（LLM 增量维护）
├── PITFALLS.md                   # 高频踩坑与 Review 打回错题本（严控 <= 30 条，原位去重更新）
├── domains/                      # 按业务域/核心特性划分的语义词条卡片（按需创建，增量覆写）
│   └── <domain>.md
└── _generated/                   # 脚本自动生成（禁止手改，随时重跑覆盖）
    ├── COMPONENT_INDEX.md        # 导出组件、Props 类型、Variant/Union 变体清单 + Hooks/Utils 索引
    ├── MODULE_GRAPH.md           # 模块拓扑 Mermaid 图、高频核心基础件榜单（Hubs）、反向依赖查询
    ├── graph.json                # 机器可读的符号与依赖边索引（供 grep / jq 秒查影响面）
    └── graph-viewer.html         # 面向人类的零依赖离线交互式可视化看板（L1拓扑 / L2爆炸半径 / L3组件变体库）
```

## 操作流程

### 0. 首次初始化向导：探测本机 Coding CLI 并让用户自选各阶段模型

在首次初始化仓库，或检测到项目 `.agents/swarm-forge.json` 与全局 `~/.gemini/config/swarm-forge.json` **均不存在**（或用户要求重新配置模型）时执行：

1. **并行探测环境**：
   - 运行本插件自带的环境探测脚本（位于插件根目录 `scripts/detect_env.mjs`），检测本机已安装的外部 Coding CLI（如 `codex`、`claude`、`opencode`、`gemini`、`aider` 等）：
     ```bash
     node "<插件根目录>/scripts/detect_env.mjs" "<项目根目录绝对路径>"
     ```
   - 同步调用 `swarm{action: "models", all: true}` 查看当前账号可用模型与剩余额度。
2. **用 `ask_question` 弹出 3 个阶段模型自选框（首选项带 `(Recommended)`）**：
   - **Q1 扫描与 Wiki 阶段（`scout` / `wiki`）**：默认 `(Recommended) Gemini 3.8 Flash (Medium)`（极速省额），可选 `Gemini 4 Hydrogen (Medium)`；
   - **Q2 编码工兵阶段（`author-*`）**：默认 `(Recommended) 常规切片 Gemini 4 Hydrogen (High) + 核心攻坚 Gemini 4 Neon (High)`，可选全 `Gemini 4 Neon (High)` 或全 `Gemini 4 Hydrogen (High)`；
   - **Q3 Review 终审阶段（`reviewer`，兼容不同订阅额度与交叉评审）**：
     - `(Recommended) Antigravity 原生 Claude 5.5：日常 claude-sonnet-5-5-high，高危升级 claude-opus-5-5-high`
     - `Antigravity 原生 Gemini 4 Carbon 兜底（省 Claude 额度）：日常 gemini-4-neon-high，高危/全量使用 gemini-4-carbon-high`
     - **动态追加本机探测到的外部 Coding CLI 交叉评审选项**（仅列出 `detect_env.mjs` 实测存在的 CLI！例如：若装了 `codex`，提供 `本机 Codex CLI 交叉评审（连接 Astra / Sol，不消耗 Antigravity Claude 额度）`；若装了 `claude`，提供 `本机 Claude Code CLI 交叉评审（走本地独立订阅）`；若装了 `opencode` 等同样列出）。
3. **落盘配置文件**：将用户选择写入项目 `.agents/swarm-forge.json`（若用户选择全局生效则写入 `~/.gemini/config/swarm-forge.json`），结构示例：
   ```json
   {
     "scout": "gemini-3.8-flash-medium",
     "wiki": "gemini-3.8-flash-medium",
     "authorSlice": "gemini-4-hydrogen-high",
     "authorCore": "gemini-4-neon-high",
     "reviewer": {
       "mode": "swarm-model",
       "defaultModel": "claude-sonnet-5-5-high",
       "highRiskModel": "claude-opus-5-5-high",
       "fallbackModel": "gemini-4-carbon-high"
     }
   }
   ```
   *(若用户选了外部 Coding CLI，如 Codex CLI 接 Astra/Sol，则写为：`"reviewer": { "mode": "external-cli", "cli": "codex", "model": "astra", "runnerModel": "gemini-4-neon-medium", "fallbackModel": "gemini-4-carbon-high" }`)*

### 1. 运行 AST 图谱扫描脚本（生成 `_generated/` 与初始化骨架）

在目标工作区运行本技能自带的扫描脚本 [scan_ts_graph.mjs](./scripts/scan_ts_graph.mjs)（脚本位于当前 `SKILL.md` 同级的 `scripts/scan_ts_graph.mjs`；优先自动调用工作区 `node_modules/typescript` 的编译器 AST 解析，未安装依赖时自动降级为轻量解析）：

```bash
node "<本技能目录>/scripts/scan_ts_graph.mjs" "<项目根目录绝对路径>"
```

脚本会在数秒内生成/刷新 `_generated/COMPONENT_INDEX.md`、`_generated/MODULE_GRAPH.md` 和 `_generated/graph.json`；若 `INDEX.md` 或 `SYSTEM_PATTERNS.md` 尚不存在，会自动创建初始模板（不会覆盖已有人工/AI 总结）。

### 2. 首次初始化语义层（仅当 `SYSTEM_PATTERNS.md` 仍为初始占位符时）

1. 阅读刚生成的 `_generated/MODULE_GRAPH.md`（看核心 Hub 文件与目录分层）和 `package.json` / `tsconfig.json`。
2. 抽样阅读排名前 3~5 的高频基础组件或核心工具文件，摸清该仓库的真实惯例：
   - UI 与样式体系（如 Tailwind / CSS Modules / shadcn / Antd / Radix / CVA `cva()` 变体写法）；
   - 状态管理与数据请求封装（如 Zustand / TanStack Query / Pinia / Server Actions）；
   - 目录职责边界与命名规范。
3. 将这些事实精炼写入 `.agents/wiki/SYSTEM_PATTERNS.md` 与 `.agents/wiki/INDEX.md`（每个文件控制在 150 行以内，只写架构干货与真实路径，不写空话）。

### 3. 功能迭代后的增量编译回写（Post-Delivery Wiki Update）

每次完成跨文件新功能、新增组件变体或模块重构后：

1. **先重跑扫描脚本**，确保 `_generated/` 中的组件变体表和依赖边与最新代码严格一致。
2. **像维护百科词条一样“原位编译更新”，严禁追加流水账（No Changelog Bloat）**：
   - 若本次为某现有组件新增了变体或使用约束，或在某个业务域沉淀了关键状态流转规则，直接修改 `.agents/wiki/SYSTEM_PATTERNS.md` 或 `.agents/wiki/domains/<domain>.md` 对应章节的当前状态描述；
   - 若删除或废弃了旧模块，直接从词条中清理过时描述；
   - **提炼 Review 错题本与结构化加固（`PITFALLS.md`）**：若本次开发曾被 `reviewer` 打回，将该项目的真实易错点浓缩为 1 行“禁止 X $\rightarrow$ 必须 Y”写入 `.agents/wiki/PITFALLS.md`（总条目严控 <= 30 条，绝不记日期流水账）。**重要**：若发现同类失误已在 `PITFALLS.md` 出现过 2 次以上，说明纯文字提醒无效——必须在汇报中建议按 **“架构收拢唯一入口 > TS 类型锁死 > Lint/脚本门禁 > 行为测试”** 的优先级将其固化进代码结构，固化后即可从 `PITFALLS.md` 移除该文字规则；
   - 更新 `.agents/wiki/INDEX.md` 中的域词条链接表。

### 4. 可选：周度自我进化巡检（配合 Antigravity `/schedule`）

若用户希望定期迭代团队规范，可建议创建每周一次的定时任务（运行在 `Gemini 4 Neon`）：读取 `.agents/wiki/PITFALLS.md` 中反复出现的最高频痛点，向用户提议 **唯一 1 条** 最具杠杆率的 `SYSTEM_PATTERNS.md` 或项目级 `.agents/rules/` 改进草案，待用户确认后生效。

## 人类可视化浏览支持（双模式）

1. **离线交互式看板（零依赖、团队可共享）**：每次运行 `scan_ts_graph.mjs` 会自动生成 `.agents/wiki/_generated/graph-viewer.html`（支持 L1 三栏模块拓扑与循环依赖标红、L2 单文件上下游爆炸半径追踪、L3 组件变体画廊与实时搜索）。生成完成后直接给用户提供可点击的 `file://` 链接，浏览器双击即看。
2. **对话内即时交互渲染（`generative_ui`）**：当用户在聊天中直接问“把当前项目的依赖图/组件关系可视化画给我看”时，读取 `.agents/wiki/_generated/graph.json`，激活 Antigravity 内置的 `generative_ui` 技能，在对话流内即时渲染一个交互式模块拓扑与爆炸半径小组件，同时附上 `graph-viewer.html` 完整离线版链接。

## 检索与影响面分析技巧（供日常查询使用）

- **查可复用组件或变体**：直接读 `.agents/wiki/_generated/COMPONENT_INDEX.md` 或 `grep -i 'Modal\|Dialog' .agents/wiki/_generated/COMPONENT_INDEX.md`。
- **查改某文件会影响谁（Blast Radius）**：
  ```bash
  jq -r '.importedBy["src/components/Button.tsx"][]?' .agents/wiki/_generated/graph.json
  ```
