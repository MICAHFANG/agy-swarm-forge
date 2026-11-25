# PostgreSQL (PGSQL)、SQL 调优与 Drizzle ORM 高性能数据访问规范

> 围绕 **减少数据库往返次数（RTT）、降低 PostgreSQL CPU/IO/MVCC 膨胀压力、杜绝锁表与连接池耗尽** 制定的硬性准则。凡触及 Schema、索引、列表查询或事务写入，必须逐条核对。

---

## 1. [CRITICAL] 彻底消灭 N+1 查询与多余往返（善用 PG 原生 `RETURNING` 与批量操作）

1. **严禁循环查库**：**绝对禁止**在 `for` / `for...of` / `.map()` 循环体内调用任何 `db.select`、`db.insert`、`db.update`！
   - 一对多/多对一优先用单次 `inArray` 批量拉取后在内存 `Map.groupBy` 组装，或使用显式 `leftJoin` / Drizzle Relational Queries（底层生成单条 SQL Lateral Join）。
2. **善用 PostgreSQL `RETURNING` 省掉写后二次查询**：
   - `INSERT`、`UPDATE`、`DELETE` 需要拿到变更后的字段或生成的主键时，直接链式调用 `.returning({ id: table.id, ... })`，**严禁写完再多发一条 `SELECT` 往返**！
3. **批量 Upsert 合并**：
   - 批量写入按每批 `200 ~ 500` 行分片执行单条 `db.insert(t).values(chunk).onConflictDoUpdate(...)`，禁止逐行交互。

```ts
// ❌ 致命反模式：循环内 N+1 查询 + 写后多余 SELECT
for (const item of items) {
  const existing = await db.select().from(products).where(eq(products.sku, item.sku));
  if (!existing.length) await db.insert(products).values(item);
}

// ✅ 正确范式：单次批量 Upsert + RETURNING 一次网络往返搞定
const upserted = await db
  .insert(products)
  .values(items)
  .onConflictDoUpdate({
    target: products.sku,
    set: { price: sql`excluded.price`, updatedAt: sql`now()` },
  })
  .returning({ id: products.id, sku: products.sku });
```

---

## 2. [CRITICAL] PostgreSQL 专属索引利器与防全表扫描（`Seq Scan`）

### 2.1 外键列必须手动建索引！（PG 最常见隐形大坑）
- **铁律**：PostgreSQL **不会**自动为外键列（Foreign Key）创建索引！凡是用于 `JOIN`、子表按父 ID 查询（如 `order_items.order_id`、`memberships.workspace_id`）或带 `ON DELETE CASCADE` 的外键列，**必须在 Drizzle Schema 中显式声明 `index()`**，否则父表删除一行会触发子表全表扫描加锁。

### 2.2 巧用 PG 四大高阶索引降低存储与 IO 压力
1. **部分索引（Partial Index — PG 王牌特性）**：
   - 软删除表（`WHERE deleted_at IS NULL`）或只查少数活跃状态的队列表（`WHERE status = 'pending'`），使用条件部分索引，索引体积可缩小 80%+ 且写入维护成本极低：
     ```ts
     index('idx_jobs_pending').on(table.runAt).where(sql`${table.status} = 'pending'`)
     ```
2. **覆盖索引（Covering Index `INCLUDE`）**：
   - 高频列表查询使用 `CREATE INDEX ... ON orders (tenant_id, created_at DESC) INCLUDE (status, total_cents)`，命中 **Index-Only Scan** 免回堆表（Heap Fetch）。
3. **JSONB 与模糊搜索专用索引**：
   - 高频按 `jsonb` 内部键值过滤用 **GIN 索引**（`@>` 包含操作符）；
   - 确需双端模糊匹配 `ILIKE '%keyword%'` 时，启用 `pg_trgm` 扩展并建 `gin_trgm_ops` 索引，严禁在大表上无索引裸跑 `%keyword%`。
4. **防索引失效红线**：
   - 复合索引遵循最左前缀（等值列在前，范围/排序列在后）；
   - 严禁在索引列套函数（如 `DATE_TRUNC('day', created_at) = ...`，改为范围常量 `created_at >= $1 AND created_at < $2`）；
   - **慎用 `NOT IN (subquery)`**：在 PG 中一旦子查询结果含 `NULL`，整个 `NOT IN` 结果永远为空且难以走高效反连接——一律改用 **`NOT EXISTS`** 或 `<> ALL(...)`；
   - 拒绝无脑 `SELECT *`（避免拉取 TOAST 大字段拖慢内存与网络）。

---

## 3. [CRITICAL] 游标分页替代深分页与昂贵 `COUNT(*)`

- **PG 的 MVCC 计数代价**：PostgreSQL 因多版本并发控制（MVCC）机制，`SELECT COUNT(*) FROM big_table WHERE ...` 必须扫描所有匹配元组校验可见性，在大表上极重！`OFFSET 100000` 同样会扫描并丢弃前十万行。
- **正确范式**：
  1. 优先采用 **PostgreSQL 原生行值元组游标分页（Tuple Keyset Pagination）**，配合 `limit(pageSize + 1)` 判断是否有下一页，彻底省掉 `COUNT(*)`：
     ```sql
     -- 配合复合索引 (tenant_id, created_at DESC, id DESC)，翻到第几万页都是 < 2ms
     SELECT id, title, created_at
     FROM documents
     WHERE tenant_id = $1
       AND (created_at, id) < ($2, $3)
     ORDER BY created_at DESC, id DESC
     LIMIT 21;
     ```
  2. 若产品界面非要展示“约 XXX 条总数”，对超大表优先用缓存计数、计数器表或 `pg_class.reltuples` 估算值，避免每次翻页实时全扫 `COUNT(*)`。

---

## 4. [CRITICAL] 事务、MVCC 死元组膨胀与连接池保护

1. **严禁出现 `idle in transaction`（绝对禁止事务内调外部网络！）**
   - 在 `db.transaction(async (tx) => { ... })` 内部调 HTTP / AI 接口 / 发邮件 / 慢 Redis 操作是 PostgreSQL 头号杀手：不仅霸占 PgBouncer 连接池，还会阻止 `autovacuum` 回收旧版本死元组（Dead Tuples）导致全库表膨胀，甚至锁死后续 DDL！所有外部 IO 必须在开启事务前或提交后执行。
2. **并发抢单/队列消费用 `FOR UPDATE SKIP LOCKED`**：
   - 多个 Worker 并发拉取待处理任务时，使用 `SELECT ... WHERE status = 'queued' ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED`，零锁等待冲突。
3. **原子条件更新防并发写覆盖**：
   - 额度扣减、状态流转一律用单条带条件 `UPDATE ... SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING credits`，严禁“先 `SELECT` 到内存算完再 `UPDATE`”。
4. **生产大表零停机迁移（Safe DDL）**：
   - 在百万行以上大表加索引必须用 `CREATE INDEX CONCURRENTLY`（注意不能包在事务块里）；加新 `NOT NULL` 列先设默认值或分步 `ADD CONSTRAINT ... NOT VALID` 再 `VALIDATE CONSTRAINT`，避免获取长时 `ACCESS EXCLUSIVE` 排他锁阻塞线上读写。
