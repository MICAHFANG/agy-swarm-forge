# Next.js、React 与严格 TypeScript 前端工程范式

> 融合 `vercel-labs/agent-skills` 性能准则与 `poteto` 类型系统纪律，杜绝“能跑但难维护的组件垃圾代码（Slop）”。

---

## 1. [CRITICAL] TypeScript 类型系统铁律（Make Illegal States Unrepresentable）

1. **判别联合类型替代松散可选字段包（Discriminated Unions over Optional Bags）**
   - 组件状态或接口响应存在互斥分支时，严禁定义一堆可任意组合的布尔和可选字段；用唯一字面量标签（`status` / `kind`）建模，并在 `switch` 的 `default` 分支用 `const _exhaustive: never = state` 锁死穷尽检查：
   ```ts
   // ❌ 反模式：允许 { loading: true, error: 'fail', data: [...] } 这种矛盾状态出现
   type QueryState<T> = { loading: boolean; data?: T; error?: string };

   // ✅ 正确范式：编译器自动收窄，不可能构造出非法组合
   type QueryState<T> =
     | { status: 'loading' }
     | { status: 'success'; data: T }
     | { status: 'error'; message: string };
   ```
2. **单一数据源推导，零 `any`、零裸 `as` 强转**
   - 优先从权威 Zod Schema（`z.infer<typeof Schema>`）、Drizzle 表定义（`typeof table.$inferSelect`）或 Hono RPC `InferResponseType` 配合 `Pick` / `Omit` 派生类型，禁止手抄一份极易漂移的重复 `interface`；
   - 需要保留对象字面量精确类型同时校验结构时，用 **`satisfies`** 替代 `as`。
3. **品牌原语防串参（Branded Primitives）**
   - 当核心函数同时接收多个同为 `string` 或 `number` 的业务 ID（如 `(workspaceId, userId, docId)`）时，在边界定义品牌类型 `type WorkspaceId = string & { readonly __brand: 'WorkspaceId' }`，彻底消灭传反顺序的低级事故。

---

## 2. [CRITICAL] 组件变体与组合设计（拒绝布尔 Props 爆炸与重复造轮子）

1. **严禁布尔属性爆炸（No Boolean Prop Proliferation）**
   - ❌ 看到 `<Card isCompact isHighlighted isClickable hasFooterBorder />` 立刻警惕：$N$ 个布尔值会产生 $2^N$ 种样式冲突组合！
   - ✅ 收敛为正交枚举变体 `variant?: 'default' | 'elevated' | 'outlined'` + `size?: 'sm' | 'md'`（配合 `cva` / `tailwind-variants`），复杂结构差异用**插槽 Props（`header` / `footer` / `action`）或复合子组件（Compound Components，如 `<Dialog.Header>`）**承接。
2. **派生状态直接算，严禁滥用 `useEffect` 同步状态**
   - 凡是能由现有 `props` 或 `state` 在渲染期直接算出来的值（如筛选列表、全选态、格式化金额），直接在渲染函数内计算（昂贵计算才加 `useMemo`）；**严禁写 `useEffect(() => setFiltered(...), [items, query])` 制造多余二次渲染和状态撕裂！**

---

## 3. [HIGH] Next.js App Router 性能与边界铁律

1. **将 `"use client"` 推向组件树最末端的交互叶子节点**
   - 页面级骨架与数据获取默认保持在 Server Component（零客户端 JS 体积）；只把真正需要 `useState` / 浏览器事件的按钮、表单、交互弹窗抽成小巧的 Client Component，并通过 `children` 插槽组合服务端内容。
2. **服务端数据脱敏（Data Tainting / DTO 裁剪）**
   - 从 Drizzle 查出的记录传给 Client Component 前，只挑选前端渲染必需的字段，严禁把整行 `user`（含内部标识、敏感配置、大 JSON）直接塞进 Client Props 序列化到 HTML 源码里。
3. **消除请求瀑布流与合理流式渲染**
   - 页面依赖多个独立数据源时，先同步发起 Promise（`const aPromise = getA(); const bPromise = getB();`），再用 `Promise.all` 或将慢模块包裹在独立 `<Suspense fallback={<Skeleton />}>` 中流式输出，确保首屏快模块秒出。
4. **URL 即状态（URL SearchParams as State）**
   - 搜索词、筛选条件、排序、当前 Tab、分页游标优先同步到 URL `searchParams`（或 `nuqs`），保证刷新页面、复制链接分享和浏览器后退行为天然正确。
