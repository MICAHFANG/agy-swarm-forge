---
name: swarm-delivery
description: >-
  在需求契约锁定后，或当用户显式要求“用 swarm / 蜂巢推进”（含语音输入谐音如“用这个 home 来推进”）时，
  优先于内置同构 swarm 激活本技能：使用异构模型 Swarm 蜂巢（Gemini 3.8 Flash + Hydrogen + Neon + 按需 Carbon）
  并发执行“TS 复用审计 -> 增量编码与本地自测 -> Neon High 对抗式严苛 Review（高危场景升级 Carbon High） -> Wiki 增量编译回写”的全自动交付。
---

# 异构蜂巢并发交付编排（`swarm-delivery`）

本技能将 `swarm` 原生蜂巢能力与用户钦定的 **Gemini 4 / 3.8 异构模型矩阵** 深度绑定，确保主控会话始终轻量跟手，而交付代码在内部经过独立只读 `Neon High`（高危复杂场景自动升级 `Carbon High`）严苛打磨达到 95 分水准。

> **前置必读**：先从当前可用技能列表中加载并阅读内置 `swarm` 技能的 `SKILL.md`，掌握 `swarm`、`post_message`、`read_board`、`swarm_wait` 的基础协议（注意：创建蜂巢的首回合结束时 `post_message`/`read_board`/`swarm_wait` 才会在下一回合挂载，且首回合回复末尾必须单独一行原样输出 `open_board` 值以便用户打开面板查看实时进度）。

## 一、 用户钦定的异构模型分工矩阵（严禁随意混用）

创建 Worker 时通过 `swarm{action: "add", model: "<model-id>", ...}` 显式固定模型：

| 蜂巢角色 | Roster 命名规范 | 固定绑定模型 ID | `workspace` 模式 | 核心职责 |
| :--- | :--- | :--- | :--- | :--- |
| **主控（你）** | `coordinator` | 保持当前会话模型（推荐日常挂 `Gemini 4 Neon`） | — | 只做任务切分、面板调度、冲突仲裁与最终交付汇报，**绝不亲自下场写大段业务代码阻塞响应** |
| **复用侦察兵** | `scout` | `gemini-3.8-flash-medium` | `inherit` | 秒查 `.agents/wiki/` 与源码，在面板发布《现有组件变体复用与增量改造清单》 |
| **常规编码/测试工兵** | `author-<slice>` | `gemini-4-hydrogen-high` | 多作者并发用 `share`，单作者用 `inherit` | 负责常规业务切片、在现有组件上新增 `variant`/Props、编写单元测试与边缘态处理 |
| **核心攻坚工兵** | `author-<core>` | `gemini-4-neon-high` | 多作者并发用 `share`，单作者用 `inherit` | 负责复杂跨模块状态流转、底层抽象改造、高难度交互或性能敏感模块 |
| **独立对抗终审官** | `reviewer` | 默认 `gemini-4-neon-high`；按需升级 `gemini-4-carbon-high`（见下） | `inherit` | 加载 `strict-review` 技能，**纯只读不改码**；对照 `.agents/specs/` 与复用铁律打分，低于 90 分直接 `@author-*` 打回返修 |
| **图谱记忆官** | `wiki` | `gemini-3.8-flash-medium` | `inherit` | 代码合入主工作区并通过终审后，加载 `ts-repo-wiki` 重跑 AST 图谱脚本并增量编译更新语义 Wiki |

**`reviewer` 模型分级选型规则**：
- **默认日常场景（85%~90%）$\rightarrow$ `gemini-4-neon-high`**：常规前端组件与变体扩充、全栈业务功能、接口联调、模块整理重构。兼顾 95 分清单审查精度与高速返修闭环。
- **高危重逻辑场景（10%~15%）$\rightarrow$ 升级为 `gemini-4-carbon-high`**：当改动命中以下任一条件时启用：
  1. 底层核心架构/公共核心底座重写（影响 `.agents/wiki/_generated/MODULE_GRAPH.md` 中的高 Fan-In 核心枢纽文件）；
  2. 复杂异步并发/竞态控制、多端状态同步或复杂状态机；
  3. 鉴权、权限边界、计费支付等零容错高危逻辑；
  4. 用户显式要求“用 Carbon 严审 / 深度审查”。

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
   INPUT & OWNED FILES: <契约 .agents/specs/<slug>.md、必读 .agents/wiki/PITFALLS.md，以及独占可修改的文件列表>
   REUSE & NEVER: <必须复用的现有组件/变体（如在 Modal.tsx 扩充 variant='drawer'）；严禁新建的重复组件、严禁触碰的非所属文件>
   DONE WELL: <3~5 条硬性完成标准：tsc 零报错、单测通过、Loading/Empty/Error/Normal 四态齐全>
   HANDOFF: <自测全绿后直接 @reviewer 贴出 git diff 摘要与验证命令真实输出（标明 Round 1/2）>
   ESCALATE IF: <发现需求契约自相矛盾、依赖阻塞，或返修满 2 轮仍无法通过时，立即停止盲改并 @coordinator 说明卡点>
   ```

4. 首回合向用户发 2~3 行简短启动说明，末尾单独一行放 `open_board` 面板入口，结束回合等待唤醒。

### Phase 2：增量编码 + 本地真实验证（Author 内部闭环）

要求所有 `author-*` 在提审前必须自行跑通以下验证并在面板贴出关键结果：
1. **类型与静态检查**：`npx tsc --noEmit`（或项目 `pnpm typecheck` / `npm run lint`）零新增错误；
2. **单元/集成测试**：运行受影响模块的测试套件，新增逻辑补充针对性测试；
3. **前端 UI 实测**（若涉及可视页面且本地开发服务可启动）：配合浏览器预览或组件渲染检查确认正常态、空态、加载态、报错态无样式崩坏或控制台报错；
4. 若使用 `workspace: "share"`，在各自工作区完成清晰 Commit 并在面板报出分支/提交信息。

### Phase 3：独立对抗式 Review 循环（默认 `Neon High`，高危按需 `Carbon High`，最多 2 轮熔断）

1. `reviewer`（默认 `gemini-4-neon-high`，高危场景 `gemini-4-carbon-high`）加载 `strict-review` 技能，逐项核查：
   - 是否违反“复用与变体优先”私自造轮子，或重犯 `.agents/wiki/PITFALLS.md` 中的历史错题？
   - 是否完整覆盖 `.agents/specs/<slug>.md` 的所有交互分支与异常四态？
   - 是否有任何类型逃逸（`any` / 强转）或回归风险（通过 `.agents/wiki/_generated/graph.json` 核查被修改文件的上游调用方 `importedBy`）？
2. **返修闭环与“最多 2 轮（Max 2 Rounds）”硬熔断机制**：
   - **Round 1 未满 90 分（或含 Blocker/Major）**：`reviewer` 直接 `@author-*` 给出精确到文件行号的修复指令，`author-*` 修复重验后发 `Round 2/2` 复审；
   - **Round 2 仍未满 90 分（触发熔断，严禁无限乒乓空烧配额！）**：`reviewer` 不再退回给原 Author 盲改，而是直接 `@coordinator [ESCALATE after 2 rounds]` 报出剩余未解分歧。主控此时二选一处理：
     1. 若原 Author 是 `gemini-4-hydrogen-high` 因复杂逻辑卡壳，用 `swarm{action: "model", name: "author-...", model: "gemini-4-neon-high"}` 升级模型做最后一次定点收敛；
     2. 若属于需求边界或产品取舍冲突，立即用 `ask_question`（带 `(Recommended)`）向用户请示拍板。
3. **达到 >= 90 分且验证全绿**：
   - 若 Author 使用了 `workspace: "share"`，先将其改动干净合入主工作区（cherry-pick / merge）并跑一次集成 `tsc --noEmit` 确认零冲突；
   - 随后唤醒 `@wiki` 执行知识库与错题本同步。

### Phase 4：Wiki 与错题本增量回写，干净收尾

1. `wiki` Worker 加载 `ts-repo-wiki` 技能：
   - 运行 `scan_ts_graph.mjs` 更新 `.agents/wiki/_generated/` 组件变体表与模块图谱；
   - 增量更新 `.agents/wiki/SYSTEM_PATTERNS.md` 或 `domains/<domain>.md` 中新增的组件变体/业务规则词条；
   - **错题本沉淀**：若本次面板记录中曾发生过 Review 打回（Round 1 未一次过），将该次失误的共性根因浓缩成 1 条精炼防坑规则原位合入 `.agents/wiki/PITFALLS.md`（总长严控在 30 条以内），完成后 `@coordinator` 汇报。
2. 主控回收并 `kill` 已完成使命的临时工作区 Worker（确认改动已落地主工作区后再 `kill`！若启用了 `monitor` 先发 `[done] <summary>`）。
3. **向用户简洁交付**：先给结论，列出复用/扩展了哪些既有组件、改了哪几个关键文件、验证与独立 Review 得分，控制在极简篇幅内。
