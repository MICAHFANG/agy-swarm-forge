# Hono 后端、Redis 缓存与高并发可靠性规范

> 面向 **Hono + Redis + TypeScript** 服务端的延迟优化、缓存治理、并发安全与抗脆弱实践。

---

## 1. [CRITICAL] 消除异步瀑布流与无界等待

1. **独立 IO 一律并发执行**：前后无数据依赖的 DB 查询、Redis 读取或内部服务调用，必须用 `Promise.all` 并发发出，严禁顺手写成串行 `await A; await B; await C;` 把接口 RT 翻三倍。
2. **所有外部网络调用必须带显式超时**：调用第三方 HTTP / Webhook / AI 接口时，强制传入 `signal: AbortSignal.timeout(ms)`，严禁裸 `fetch(url)` 让慢下游拖死整个实例。

---

## 2. [CRITICAL] Redis 生产级模式（防雪崩、防击穿、防穿透、零循环 RTT）

### 2.1 杜绝 Redis 循环往返与无过期死键
- ❌ **严禁在循环里逐条 `await redis.get` / `redis.set`**：超过 2 个键必须使用 `redis.mget(...)` 或 **`redis.pipeline()`** 打包成一次网络往返。
- ❌ **严禁写入不带 TTL 的缓存键**：所有缓存型 Key 必须显式设置过期时间，并加上 **5%~15% 随机抖动（Jitter）** 防止大批热点缓存同一秒集中失效冲垮 PostgreSQL（缓存雪崩）。
- **命名空间规范**：统一使用冒号分层前缀与版本号，如 `app:v1:user:profile:${userId}`，严禁裸键名污染全局空间；生产代码**绝对禁止调用 `KEYS *`**（会阻塞 Redis 单线程），遍历必须用 `SCAN`。

### 2.2 热点 Key 防击穿与缓存穿透保护
- **防穿透（恶意/高频查不存在的 ID）**：当 PostgreSQL 查不到记录时，往 Redis 写入短 TTL（如 30~60s）的空值哨兵 `NULL_SENTINEL`，避免每次请求直接打穿到数据库。
- **防击穿（高并发热点 Key 过期瞬间）**：对计算昂贵或高 QPS 的热点聚合查询，使用内存级 **Singleflight（进程内同 Key Promise 复用）** 或 Redis `SET lockKey token NX PX 5000` 互斥锁，确保同一时刻只有 1 个请求回源查 PostgreSQL，其余并发请求等待或返回旧值（Stale-While-Revalidate）。
- **写后一致性**：优先采用 **“先写 PostgreSQL 成功后，再 `DEL` 删缓存”**（而非双写 `SET` 缓存，防止并发写乱序产生永久脏数据）。

### 2.3 原子操作必须用 Lua 脚本或原生原子指令
- 限流器（Rate Limiter）、库存预扣、分布式锁释放（校验 `GET key == myToken` 后再 `DEL`）严禁在 Node 侧拆成“先 `GET` 判断再 `SET/DEL`”两步网络请求——并发下必出竞态漏洞，必须使用单条原子命令或 `EVAL` Lua 脚本。

---

## 3. [HIGH] Hono 路由架构与边界纪律（Boundary Discipline）

1. **入口一次性解析，保持路由层极薄**：
   - 使用 `@hono/zod-validator` 在路由定义处完成 `json` / `query` / `param` 校验，让 Hono RPC（`hc<AppType>`）自动推导全栈端到端请求与响应类型（注意链式写法 `const routes = app.get(...).post(...)` 以保留 `AppType` 字面量推导！）。
   - 路由 Handler 只负责**鉴权提取 $\rightarrow$ 调纯领域函数 $\rightarrow$ 返回标准状态码 JSON**，严禁在路由回调里堆砌上百行 Drizzle SQL 与业务分支。
2. **统一错误边界**：
   - 业务层抛出带明确错误码的领域异常（如 `AppError('INSUFFICIENT_QUOTA', 429)`），统一由顶层 `app.onError` 映射为规范 HTTP 响应并记录结构化日志（带 `requestId`），严禁在每个路由里手写重复 `try/catch` 吞掉原始堆栈或把 SQL 报错原文直接暴露给客户端。

---

## 4. [HIGH] 写接口幂等性与异步削峰（Idempotency & Queues）

1. **重试必须收敛到同一终态（Make Operations Idempotent）**：
   - 支付回调、Webhook 消费、订单创建、定时任务重跑等入口，必须设计幂等保护（如客户端传入 `Idempotency-Key` 配合 Redis 幂等锁，或在 PostgreSQL 业务唯一键 `(source, external_event_id)` 上配合 `ON CONFLICT DO NOTHING` 做唯一约束兜底）。
2. **慢操作异步化**：
   - 耗时超过 `500ms~1s` 且无需同步阻塞用户首屏的非关键副作用（统计汇总、批量通知、生成大报表、审计归档），从同步请求链路剥离，投递到后台队列或异步 Worker 处理。
