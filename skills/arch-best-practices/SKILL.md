---
name: arch-best-practices
description: >-
  软件工程底层架构范式、领域最佳实践库（Drizzle / PostgreSQL / SQL 优化、Hono / Redis 高并发后端、
  Next.js / 严格 TypeScript 前端）与高质量开源标杆项目寻优技能。在设计模块边界、编写数据库查询/缓存/接口、
  引入新库或执行架构级 Code Review 时激活，按需懒加载对应 `references/`。
---

# 软件工程范式与开源标杆最佳实践（`arch-best-practices`）

本技能解决“只照抄当前项目旧代码可能延续烂设计，而面对新框架又不知道业界最佳写法”的问题。采用**渐进式按需加载**：**不要一次性把所有 `references/` 全读进上下文**，只根据当前任务触及的技术面精准读取对应的 1~2 份参考手册。

---

## 一、 永恒软件工程与领域范式路由表（按需必读）

动工设计、编写核心代码或执行 `strict-review` 前，按触及领域读取对应手册：

| 任务触及面 | 必读 Reference 手册 | 核心约束焦点 |
| :--- | :--- | :--- |
| **跨模块边界、目录分层、重构、设计模式选型** | [software-architecture.md](./references/software-architecture.md) | 深模块 vs 浅透传层、单向依赖、防“一件事两套写法”、先删后加、实用设计模式与 YAGNI 红线、五层结构化防错 |
| **PostgreSQL 表结构、SQL 调优、Drizzle ORM 数据访问** | [postgres-drizzle-data.md](./references/postgres-drizzle-data.md) | 消灭循环 N+1、外键/部分/GIN/覆盖索引、元组游标分页替 `OFFSET`/`COUNT(*)`、严禁事务内网络 IO 防 MVCC 膨胀 |
| **Hono 路由/RPC、Redis 缓存/锁、异步并发与幂等** | [hono-redis-backend.md](./references/hono-redis-backend.md) | 边界 Zod 一次性校验、消除 `await` 瀑布流、Redis 防击穿/防雪崩/Pipeline 批处理、写操作幂等键、外部调用超时 |
| **Next.js App Router、React 组件架构、严格 TS 类型** | [nextjs-ts-frontend.md](./references/nextjs-ts-frontend.md) | 判别联合类型消灭非法状态、RSC/Client 边界最小化、状态就近下沉、Variant/复合组件替代布尔 Props 爆炸 |

---

## 二、 前沿框架与陌生领域：三层开源标杆寻优 SOP

当你引入新库、使用快速迭代的框架特性（如 Next.js / Drizzle / Hono 新版 API），或遇到拿不准最佳架构的复杂问题时，**严禁凭过时记忆硬猜或照搬低星玩具 Demo**，按以下三步快速寻优：

### Step 1：先核对当前精确版本的官方文档（若有 `context7` 优先调用）
- 检查项目 `package.json` 中目标库的真实版本号；
- 若当前环境已启用 `context7` MCP（`resolve-library-id` $\rightarrow$ `query-docs`），优先拉取对应版本的最新官方示例与 API 签名，杜绝幻觉出已废弃配置。

### Step 2：用量化筛选脚本从顶级生产开源仓“扒真经”
运行本技能自带的高信噪比仓库检索脚本 [find_gold_repos.mjs](./scripts/find_gold_repos.mjs)（自动剔除 `awesome-*` 纯列表、`tutorial/demo/starter` 玩具仓和超 1 年停更项目，优先匹配活跃维护的生产级 TS 仓库）：

```bash
node "<本技能目录>/scripts/find_gold_repos.mjs" "drizzle postgres cursor pagination"
# 或指定同时在代码树中搜具体实现模式：
node "<本技能目录>/scripts/find_gold_repos.mjs" "hono rate limit redis" --lang=TypeScript
```

**标杆源码阅读准则**：
1. **认准经过真实流量毒打的标杆仓**：TypeScript 全栈优先参考 `calcom/cal.com`、`dubinc/dub`、`triggerdotdev/trigger.dev`、`medusajs/medusa`、`plane-so/plane` 以及框架原厂官方仓（`honojs/hono`、`drizzle-team/drizzle-orm`、`vercel/next.js`）。
2. **只读核心模块实现，不抄业务噪音**：通过 GitHub API / `search_web` 定位标杆仓里解决同类问题的 1~2 个核心文件，提炼其**数据结构定义、边界错误处理与并发/查询合并手法**。

### Step 3：复利沉淀回本地项目 Wiki
一旦验证某套外部最佳实践适配当前仓库，在任务收尾时由 `wiki` 节点将其浓缩为 5~10 行项目规范写入 `.agents/wiki/SYSTEM_PATTERNS.md`，让后续所有会话直接享受复利，无需重复联网调研。
