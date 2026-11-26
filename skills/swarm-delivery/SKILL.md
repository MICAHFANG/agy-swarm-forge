---
name: swarm-delivery
description: >-
  在需求契约锁定后，或当用户显式要求“用 swarm / 蜂巢推进”（含语音输入谐音如“用这个 home 来推进”）时，
  优先于内置同构 swarm 激活本技能：使用跨家族异构模型 Swarm 蜂巢（Gemini 3.8 Flash 侦察 + Gemini 4 Hydrogen/Neon 编码 +
  Claude Sonnet/Opus 5.5 跨架构对抗式严审）执行全自动端到端交付。
---

# 跨家族异构蜂巢并发交付编排（`swarm-delivery`）

本技能将 `swarm` 原生蜂巢能力与 **“Gemini 4 高吞吐编码 + Claude 5.5 跨架构挑刺终审”** 深度绑定：利用不同模型家族的正交视角彻底消除“同源模型自己写自己审的盲区”，同时天然分流 Gemini 与 Claude 两个独立配额池。

> **前置必读**：先从当前可用技能列表中加载并阅读内置 `swarm` 技能的 `SKILL.md`，掌握 `swarm`、`post_message`、`read_board`、`swarm_wait` 的基础协议（注意：创建蜂巢的首回合结束时 `post_message`/`read_board`/`swarm_wait` 才会在下一回合挂载，且首回合回复末尾必须单独一行原样输出 `open_board` 值以便用户打开面板查看实时进度）。

## 一、 动态模型分工矩阵（优先读取用户配置，兼容原生跨家族与本机 Coding CLI 交叉评审）

**启动前必读配置**：依次检查项目 `.agents/swarm-forge.json` $\rightarrow$ 全局 `~/.gemini/config/swarm-forge.json`（项目级覆盖全局）。若两者均不存在，先按 `ts-repo-wiki` Step 0 探测本机 CLI 并弹出 1 轮 `ask_question` 让用户自选后落盘。

创建 Worker 时严格按配置中的模型 ID 通过 `swarm{action: "add", model: "<model-id>", ...}` 固定模型（以下为默认推荐值）：

| 蜂巢角色 | Roster 命名规范 | 默认模型（可由 `swarm-forge.json` 覆盖） | `workspace` 模式 | 核心职责 |
| :--- | :--- | :--- | :--- | :--- |
| **主控（你）** | `coordinator` | 当前会话模型（推荐 `Gemini 4 Neon`） | — | 任务切分、面板调度、冲突仲裁与最终汇报，**绝不亲自下场写大段业务代码** |
| **复用侦察兵** | `scout` | `gemini-3.8-flash-medium` | `inherit` | 秒查 `.agents/wiki/` 与 `arch-best-practices`（陌生技术调 `context7` / `find_gold_repos.mjs`） |
| **常规编码工兵** | `author-<slice>` | `gemini-4-hydrogen-high` | 多作者用 `share`，单作者用 `inherit` | 常规业务切片、扩展现有组件 `variant`、补齐本领域 DDD 秒测（`<= 30s`） |
| **核心攻坚工兵** | `author-<core>` | `gemini-4-neon-high` | 多作者用 `share`，单作者用 `inherit` | 复杂跨模块数据建模、PGSQL/Redis 高并发链路与底层抽象改造 |
| **跨架构终审官** | `reviewer` | 按配置支持 3 种模式（见下） | `inherit` | 统一跑**唯一一次带超时影响面测试**，并执行 `strict-review` 跨模型对抗打分 |
| **图谱记忆官** | `wiki` | `gemini-3.8-flash-medium` | `inherit` | 合入终审后重跑 AST 图谱脚本（含 `graph-viewer.html`），增量更新 Wiki 与 `PITFALLS.md` |

**`reviewer` 三种交叉评审模式（由用户初始化时自选）**：
1. **模式 A — Antigravity 原生 Claude 5.5（默认推荐）**：日常 `claude-sonnet-5-5-high`，高危底座/并发锁/权限计费升级 `claude-opus-5-5-high`；若 Claude 额度耗尽自动回退 `fallbackModel`（默认 `gemini-4-carbon-high`）。
2. **模式 B — Antigravity 原生 Gemini 4 Carbon 兜底（省 Claude 额度）**：日常 `gemini-4-neon-high` 或直接 `gemini-4-carbon-high`，零消耗 Claude 配额池。
3. **模式 C — 本机外部 Coding CLI 交叉评审（强烈推荐给装有 Codex / Claude CLI 的用户！）**：
   - `reviewer` Worker 本身挂 **`gemini-4-neon-medium`** 作为稳定外壳执行器：先可靠跑完本地唯一一次有界集成测试（`tsc` + 影响面单测），再调用插件根目录的 `scripts/run_cli_review.mjs` 把 `git diff` + 契约 + `strict-review` 规则送入用户指定的本机外部 CLI 做真·跨厂商只读交叉审查，并精准解析裁决结果回传面板：
     ```bash
     # 例如 Codex CLI 连接 Astra / Sol：
     node "<插件根目录>/scripts/run_cli_review.mjs" --repo="<repo>" --cli=codex --model=astra --spec=".agents/specs/<slug>.md" --round=1
     # 或本机 Claude Code CLI：
     node "<插件根目录>/scripts/run_cli_review.mjs" --repo="<repo>" --cli=claude --model=sonnet --spec=".agents/specs/<slug>.md" --round=1
     ```
   - 若外部 CLI 执行报错或超时，自动无缝降级到 `fallbackModel`（如 `gemini-4-carbon-high`）兜底，保证流水线永不中断。

*(注：若当前技能列表中存在内置 `swarm_narrator` 或 `swarm_monitor`，按内置 `swarm` 技能要求一并添加 `narrator` / `monitor`；若某模型报额度耗尽，使用 `swarm{action:"model"}` 切换同档可用模型并告知用户。)*

---

## 二、 标准四阶段蜂巢流水线

### Phase 1：建群与切片（首回合快速启动，立即返回 `open_board`）

1. 用 `swarm{action: "title", title: "<简短任务名>"}` 命名蜂巢。
2. **文件所有权硬隔离**：按不重叠的文件/模块边界切分 `author-*`（严禁两个 Author 改同一批文件！）。
   - 若你在 `grill-spec` 阶段已完全摸清需复用的组件和文件边界，首回合可直接同时添加 `author-*`、`reviewer`、`wiki`；
   - 若项目较大、复用关系尚未完全摸清，首回合先添加 `scout`、`reviewer`、`wiki`（或让 `author-*` 等待 `scout` 的复用清单 `#seq`）。
3. **每个 Worker 的 `brief` 必须采用标准化 6 字段契约**（Worker 看不到主对话历史，自由发挥极易漏边界！），严格按以下极简结构派单：

   ```text
   JOB: <一句话说明独占任务目标>
   INPUT & OWNED FILES: <契约 .agents/specs/<slug>.md、必读 .agents/wiki/PITFALLS.md、必读 arch-best-practices 对应单篇 reference，以及独占可修改文件>
   REUSE & NEVER: <必须复用的现有组件/变体；严禁新建重复组件、严禁留新旧两套并存 API、严禁在实施阶段跑全量 tsc/全仓测试>
   DONE WELL: <先定核心数据结构与判别联合类型；PGSQL 零 N+1/外键必索引；Loading/Empty/Error/Normal 四态齐全；本领域局部单测通过（超时 <= 30s）>
   HANDOFF: <完成后直接 @reviewer 贴出 git diff 摘要与局部单测结果（标明 Round 1/2）>
   ESCALATE IF: <发现需求契约矛盾、架构草图无法自洽需推倒重来，或返修满 2 轮仍未过时，停止盲改并 @coordinator>
   ```

4. 首回合向用户发 2~3 行简短启动说明，末尾单独一行放 `open_board` 面板入口，结束回合等待唤醒。

### Phase 2：增量编码 + 仅本领域极速局部验证（消除重复测试开销！）

为避免多个 `author-*` 与后续 `reviewer` 反复全量跑 `tsc` 和测试拖垮机器，严格执行**两级有界验证**：
1. **`author-*` 严禁跑全仓测试套件或重型全量构建**！
2. **仅跑本领域（DDD Slice）定点测试**：若修改的是带核心业务规则的领域服务/工具函数，只针对当前改动目录或测试文件运行局部测试，且**必须附带硬超时（`<= 30s`）**，例如：
   `npx vitest run src/modules/<domain>/ --testTimeout=10000`（无单测的纯样式/文案微调免跑测试，交由终审统一把关）。
3. 若使用 `workspace: "share"`，在各自工作区完成清晰 Commit 并在面板报出分支/提交信息后直接移交 `@reviewer`。

### Phase 3：唯一一次有界集成测试 + 独立对抗式 Review（最多 2 轮熔断）

1. **合入与有界集成门禁（只跑 1 次，限范围 + 限超时！）**：
   - 若多 Author 使用了 `workspace: "share"`，先将各分支干净合入集成工作区；
   - 由 `reviewer` 统一执行 **唯一一次** 类型检查与**按影响面收敛（Affected Scope）的测试**，**严禁无边界一把梭跑全仓慢测试/E2E**，命令必须设超时上限（`60s~90s`）：
     - 类型检查：`npx tsc --noEmit`（Monorepo 优先只跑受影响包 `pnpm --filter ...[HEAD~1] typecheck`）；
     - 影响面测试：利用 `.agents/wiki/_generated/graph.json` 的 `importedBy` 或测试框架增量能力只测受波及范围（如 `npx vitest related <changed-files> --run` 或 `pnpm --filter ...[HEAD~1] test`），若超时立即中止并收缩至直接调用方测试集。
2. `reviewer`（默认 `claude-sonnet-5-5-high`，高危场景 `claude-opus-5-5-high`）加载 `strict-review` 与触及领域的 `arch-best-practices/references/*.md`，以异构模型视角逐项核查：
   - **防造轮子与防双轨腐化**：是否私自新建重复组件，或留下了新旧两套并存 API？
   - **软件工程与领域最佳实践**：是否存在浅模块纯透传、PGSQL 循环 N+1 / 漏外键索引 / `OFFSET` 深分页 / 事务内网络 IO、Redis 无 TTL 或循环读写、TS 松散可选包/裸 `as`？
   - **完整四态与证据制**：所有 `[Blocker]` / `[Major]` 必须指出确切 `文件:行号` 与触发失败的真实执行路径（拒绝无根据的主观挑刺）。
3. **返修闭环、“质疑前提（Attack the Premise）”与最多 2 轮熔断**：
   - **Round 1 未满 90 分（或含 Blocker/Major）**：`reviewer` 直接 `@author-*` 给出精确修复指令，`author-*` 修复后发 `Round 2/2` 复审；
   - **Round 2 仍未满 90 分（触发熔断，严禁进入第 3 轮盲修！）**：`reviewer` 直接 `@coordinator [ESCALATE after 2 rounds]`。主控必须先执行 **Attack the Premise**——写出前两轮修复共同依赖的底层假设并检验该假设本身是否错误（若架构形状本身错了则推倒重画，不在烂底座上打补丁），随后将 `Hydrogen` 升级为 `Neon High` 收敛，或用 `ask_question` 请用户拍板。
4. **达到 >= 90 分且有界集成验证全绿**：唤醒 `@wiki` 执行知识库与错题本同步。

### Phase 4：Wiki 与错题本增量回写，干净收尾

1. `wiki` Worker 加载 `ts-repo-wiki` 技能：
   - 运行 `scan_ts_graph.mjs` 更新 `.agents/wiki/_generated/` 组件变体表与模块图谱；
   - 增量更新 `.agents/wiki/SYSTEM_PATTERNS.md` 或 `domains/<domain>.md` 中新增的组件变体/业务规则词条；
   - **错题本沉淀**：若本次面板记录中曾发生过 Review 打回（Round 1 未一次过），将该次失误的共性根因浓缩成 1 条精炼防坑规则原位合入 `.agents/wiki/PITFALLS.md`（总长严控在 30 条以内），完成后 `@coordinator` 汇报。
2. 主控回收并 `kill` 已完成使命的临时工作区 Worker（确认改动已落地主工作区后再 `kill`！若启用了 `monitor` 先发 `[done] <summary>`）。
3. **向用户简洁交付**：先给结论，列出复用/扩展了哪些既有组件、改了哪几个关键文件、验证与独立 Review 得分，控制在极简篇幅内。
