# 软件工程底层架构范式与反模式红线（Software Architecture & Design Patterns）

> **核心设计前提（Design for the Next Blind Agent）**：假设下一个维护者是一个只打开了 2 个局部文件、直接照抄最近示例、选最短编译路径的 AI 或新同事。**好的架构必须做到：从局部单文件看最顺手的改法，对整个系统恰好也是正确的改法。**

---

## 1. [CRITICAL] 模块深度与分层纪律（Ousterhout & Clean Boundaries）

### 1.1 深模块优于浅透传层（Deep Modules over Pass-Through Layers）
- **臭味识别**：Controller 调 Service、Service 原封不动把一模一样的 6 个参数传给 Manager、Manager 再原样传给 Repository，每一层只做了转发，没有吸收任何复杂度；或者调用方为了完成一个动作必须手动按顺序调 `init() -> validate() -> lock() -> save()`。
- **正确范式**：接口表面积要窄（参数精简、语义清晰），把复杂的并发控制、默认值推导、部分失败补偿封装在模块内部。没有独立策略或协议转换价值的纯透传函数，直接内联删掉。

```ts
// ❌ 反模式：浅模块暴露内部步骤与存储细节，调用方一旦漏调一步就出事故
const row = await orderRepo.findById(orderId);
if (row.status !== 1) throw new Error('bad state');
await inventoryService.deductRaw(row.sku_id, row.qty);
await orderRepo.updateColumns(orderId, { status: 2, paid_at: new Date() });

// ✅ 正确范式：深模块围绕领域不变量收拢所有权，暴露窄而完备的原子动作
await confirmOrderPayment({ orderId, paymentRef, idempotencyKey });
```

### 1.2 单向依赖与防信息泄漏（Boundary & Information Leakage）
- **单向依赖规则**：`路由/UI 适配层 (Next.js / Hono)` $\rightarrow$ `应用编排/领域服务层 (Domain)` $\rightarrow$ `基础设施实现层 (Drizzle / Redis / 第三方 SDK)`。领域核心规则严禁反向依赖 HTTP `Context`、`Request` 头或前端组件状态。
- **防协议泄漏**：严禁把外部第三方接口的原始下划线 JSON 结构或底层存储的内部中间字段原样透传给全链路消费。在系统入口（Boundary）一次性用 Zod 解析为干净的领域类型，内部函数之间信任静态类型，不再到处重复写防御性 `if (x && typeof x.id === 'string')`。

### 1.3 按“知识所有权”划分模块，严禁按“时间执行顺序”硬拆（No Temporal Decomposition）
- **臭味识别**：把同一份业务数据的读取、校验、转换、落库硬拆成 `loader.ts`、`validator.ts`、`transformer.ts`、`saver.ts` 四个平行目录，导致每次加一个字段要同步改 4 个文件（Hand-synced lists）。
- **正确范式**：谁拥有这项业务规则与状态不变量，谁就把完整的读写闭环收拢在同一个领域模块（`features/<domain>/` 或 `modules/<domain>/`）内，非公开内部文件禁止被跨模块直接深层 `import`。

---

## 2. [CRITICAL] 演进纪律：消灭“一件事两套写法”（Anti-Entropy）

- **先减后加（Subtract Before You Add）**：在旧模块上叠加新逻辑前，先把废弃分支、死参数、没人调的兼容胶水清掉，在干净底座上扩建。
- **杜绝新旧两套 API 长期并存**：仓库里只要同时存在 `fetchUserV1` 和 `fetchUserV2` 两套可用写法，后续 Agent 必然随机照抄其中一套导致腐化翻倍。重构内部公共方法时，**在同一批次迁移全部调用方并删掉旧入口**（利用 `.agents/wiki/_generated/graph.json` 的 `importedBy` 秒查全量调用点）。
- **先定核心数据结构再写分支逻辑（Data Shape First）**：“Bad programmers worry about the code. Good programmers worry about data structures.” 动手写 `if/else` 前，先把核心状态结构、实体关系与判别联合类型定准——数据结构对了，下游业务代码自然短小直观。

---

## 3. [HIGH] TypeScript 生态真正实用的设计模式与 YAGNI 红线

> **YAGNI 铁律**：在系统中真实出现 **至少 2 种异构实现**（或明确的测试隔离边界）之前，**严禁提前定义 `IXxxService` 接口 + 单实现类 `XxxServiceImpl` + `XxxFactory` 空壳套娃**！

1. **策略模式（Strategy）$\rightarrow$ 用“判别联合 + Record 映射表”替代庞大继承树**
   - 当不同渠道/计费类型/导出格式共享同一入口但算法不同时，禁止在主流程写超过 3 分支的膨胀 `if/else`：
   ```ts
   // ✅ TS 惯用策略注册表 + 编译期穷尽校验（新增渠道漏配直接编译报错）
   type Channel = 'stripe' | 'paypal' | 'manual';
   const handlers: Record<Channel, (ctx: PayContext) => Promise<Receipt>> = {
     stripe: payWithStripe,
     paypal: payWithPaypal,
     manual: recordManualTransfer,
   };
   ```
2. **适配器模式（Adapter / Anti-Corruption Layer）$\rightarrow$ 隔离外部易变 SDK**
   - 对接外部支付、邮件、对象存储、LLM SDK 时，不得在十几个业务文件里直接 `import` 第三方 SDK；收敛到单一适配器模块（如 `lib/storage.ts`），业务层只调领域语义函数。
3. **有限状态机（State Machine）$\rightarrow$ 替代散落的布尔标记组合**
   - 订单、审批、任务流、复杂弹窗交互等存在严格流转顺序的场景，显式定义合法的状态转换表 `ALLOWED_TRANSITIONS`，在统一转换函数里拦截非法跳变。

---

## 4. [HIGH] 结构化防错金字塔（Encode Lessons in Structure）

当某类 Bug 或 Review 扣分项出现第 2 次时，按从高到低的强制力依次选最高可行层锁死，**写文档永远是最后兜底手段**：

1. **架构消除**：收拢唯一写入口、删掉容易被误抄的旧文件；
2. **类型锁死**：用判别联合、Branded Type、`NonEmpty<T>` 让非法代码直接编译报错（`tsc` 拦截）；
3. **静态脚本 / Lint 门禁**：加一条报错信息直接点名正确替代函数的检查规则；
4. **可观测行为单测**：测试用户/调用方可感知的真实输入输出，严禁写一堆全 Mock 内部私有函数的脆弱测试；
5. **文档与 `PITFALLS.md`**：仅记录前四层无法自动表达的业务取舍。
