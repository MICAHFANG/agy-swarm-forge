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
    └── graph.json                # 机器可读的符号与依赖边索引（供 grep / jq 秒查影响面）
```

## 操作流程

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
   - **提炼 Review 错题本（`PITFALLS.md`）**：若本次开发曾被 `reviewer` 打回，将该项目的真实易错点浓缩为 1 行“禁止 X $\rightarrow$ 必须 Y”写入 `.agents/wiki/PITFALLS.md`（合并同类项，总条目严控在 30 条以内，绝不记日期流水账）；
   - 更新 `.agents/wiki/INDEX.md` 中的域词条链接表。

### 4. 可选：周度自我进化巡检（配合 Antigravity `/schedule`）

若用户希望定期迭代团队规范，可建议创建每周一次的定时任务（运行在 `Gemini 4 Neon`）：读取 `.agents/wiki/PITFALLS.md` 中反复出现的最高频痛点，向用户提议 **唯一 1 条** 最具杠杆率的 `SYSTEM_PATTERNS.md` 或项目级 `.agents/rules/` 改进草案，待用户确认后生效。

## 检索与影响面分析技巧（供日常查询使用）

- **查可复用组件或变体**：直接读 `.agents/wiki/_generated/COMPONENT_INDEX.md` 或 `grep -i 'Modal\|Dialog' .agents/wiki/_generated/COMPONENT_INDEX.md`。
- **查改某文件会影响谁（Blast Radius）**：
  ```bash
  jq -r '.importedBy["src/components/Button.tsx"][]?' .agents/wiki/_generated/graph.json
  ```
