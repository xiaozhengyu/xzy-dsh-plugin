# DSH Harness API Lock — dsh-usage-analytics (Phase 0)

> Phase 0 交付物：基于**当前安装的 DeepSeek Harness 实际源码**确认插件实现所需的全部 API。
>
> 目标版本：`@deepseek-ai/dsh` `0.1.0-rc.6`（vendored `@deepseek-ai/cordis` `4.0.1`）
> 审计日期：2026-08-16（以本文件为准，任何文档/示例与源码冲突时以源码为准）
> 状态：API LOCKED（UI 客户端 Slot 拓扑细节标注为 Phase 4 前置锁定项）

---

## 0. 审计路径约定

源码事实来源：

```text
C:\Users\xiao\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\
  @deepseek-ai\<package>\lib\types\*.d.ts   ← 权威类型定义
  @deepseek-ai\<package>\lib\*.js            ← 运行时行为（grep 确认）
```

下文所有契约均引用 `lib/types/*.d.ts` 中的原文签名（缩进/换行可能被压缩）。

---

## 1. 部署模型与插件加载

### 1.1 Profile 结构（事实）

- 每个 profile 是 `$DSH_HOME/profiles/<name>/` 目录：`package.json`（含 `dsh.profile.bundles`）、`cordis.patch.yml`（用户补丁层）、`cordis.yml`（空根）、pnpm workspace（`nodeLinker: hoisted`，`autoInstallPeers: false`）。
- 当前 web profile：`C:\Users\xiao\.dsh\profiles\web`，bundles = `[@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app, dshmarket, dsh-at-file]`，用户层 `cordis.patch.yml` 当前为 `[]`。
- 装载组合：**空根** → 各 bundle 的 patch 层（按 `dsh.profile.bundles` 顺序）→ profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch` 覆盖层，全部在**一次** `applyEntryPatches` 调用中完成。
- **补丁语义：某行的 `config` 是整体替换（last write wins），不是 merge。** `!!js` 表达式可出现在 config（`dshHomePath`、`process.env` 等）。

### 1.2 两种插件包形态

| 形态 | 声明 | 说明 |
|---|---|---|
| **Bundle** | package.json 中 `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}` | 包本身是补丁层，其 cordis.patch.yml 插入/覆盖插件行；`dsh plugin add` 成功后自动并入 `dsh.profile.bundles` |
| **普通插件模块** | profile 补丁行 `{ id, name, config }` 指向 npm 包 | 包导出 Cordis 插件对象/类 |

### 1.3 补丁行 / EntryOptions（`cordis-plugin-loader/lib/types/config/entry.d.ts`）

```ts
interface EntryOptions {
  id: string;
  name: string;        // 裸 npm 包名，或子路径如 '@deepseek-ai/dsh-tool-subagent-control/list-agents'
  config?: any;        // 作为插件 config 传入，按 plugin.Config 校验
  group?: boolean | null;
  disabled?: boolean | null;
  inject?: Inject | null;
}
```

```ts
interface PatchOptions {  // cordis-plugin-include/lib/types/index.d.ts
  id?: string;
  insert?: EntryOptions[];
  name?: string; config?: any; group?: boolean | null;
  disabled?: boolean | null; inject?: any; intercept?: any; isolate?: any;
}
```

### 1.4 插件模块契约（`cordis-plugin-loader/lib/index.js`）

Loader 归一化：`exports = exports.default ?? exports; if (!exports.__esModule) return exports; ...`
→ **具名导出（`{ name, inject, apply }`）或 default 导出均可**。实例化：`ctx.registry.plugin(plugin, options.config)`，config 按 `plugin.Config`（Standard Schema v1）校验。

代表性参照：

```ts
// dsh-session-stats/lib/types/index.d.ts（函数式插件）
export declare const name = "session-stats";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
// dsh-session-query-sqlite/lib/types/index.d.ts（类插件）
export default class SqliteSessionQueryEngine extends SessionQueryEngine {
  static inject: string[];
  static Config: z<Config>;
  constructor(ctx: Context, config: Config);
}
```

### 1.5 客户端半（`dsh.client` + `exports["./client"]`）

- package.json：`"dsh": {"client": {"inject": [...], "platform": "web", "immediately"?: boolean}}`，且 `exports["./client"]` 指向**已构建的浏览器 bundle**（string 或单层条件默认值）。
- Host 侧 `ClientModuleRegistry`（dsh-client-modules）按补丁行的 `name`（必须是裸包名）扫描、解析 `exports["./client"]`、以内容哈希提供 `/plugins/<id>/client.js?rev=<rev>` 并注入 `window.__DSH_BOOT__`；浏览器侧以同一 vendored Loader（fiber/inject 治理）运行。
- **风险**：声明 `dsh.client` 的包必须随包提供构建产物，否则激活时报 `MissingClientBundleError`；负判定永久缓存，加 `dsh.client` 需重启生效。

### 1.6 `dsh plugin` CLI（`dsh/lib/bin.js` + `plugin-*.js`）

`dsh plugin --profile <name> <pnpm args>` → 在 profile 目录执行 `pnpm <args>`（`add <pkg>` 写入 profile package.json dependencies）；成功后 reconcile：manifest 含 `dsh.bundle.patch` 的依赖并入 `dsh.profile.bundles`，其余仅作普通依赖（stderr 警告）。**从不写 cordis.patch.yml**。

---

## 2. Cordis v4 插件/服务/事件 API（vendored `@deepseek-ai/cordis` 4.0.1）

> 统一从 `@deepseek-ai/cordis` 导入（无 `@cordisjs/*`）。插件元数据用 **`Config`**（Standard Schema v1 校验器，DSH 用 `@deepseek-ai/schemastery` 的 `z<Config>` 实现），**不存在 `config` 字段、不存在 `using`**（Cordis-3 时代特性）。

### 2.1 插件类型（`lib/types/registry.d.ts`）

```ts
export type Plugin<T = any> = Plugin.Function<T> | Plugin.Constructor<T> | Plugin.Object<T>;
namespace Plugin {
  interface Base<T = any> {
    name?: string;
    Config?: StandardSchemaV1<any, T>;   // 校验器，不是默认值对象
    inject?: Inject;                     // 硬依赖：全部可用才加载，变化时自动卸载重跑
    provide?: string | string[];         // 本插件提供的服务名
    intercept?: Dict<boolean>;
  }
  interface Function<T = any> extends Base<T> { (ctx: Context, config: T): any; }
  interface Constructor<T = any> extends Base<T> { new (ctx: Context, config: T): any; }
  interface Object<T = any> extends Base<T> { apply(ctx: Context, config: T): any; }
}
```

### 2.2 事件（`lib/types/events.d.ts`）

```ts
export type DispatchMode = 'emit' | 'parallel' | 'serial' | 'bail' | 'waterfall';
on<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean;
once<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean;
emit<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): void;
// parallel / serial / bail / waterfall 同构；waterfall 最后一个监听参数是 next，不调用即否决
interface EventOptions { prepend?: boolean; global?: boolean; }
```

监听器注册是当前 fiber 的 effect（卸载自动移除）。事件通过 `declare module '@deepseek-ai/cordis' { interface Events {...} }` 增强类型化。

### 2.3 effect（`lib/types/fiber.d.ts`）

```ts
effect(execute: () => SyncEffect, label?: string): Disposable<Promise<void>>;
// execute 可返回 disposer / promise of disposer / (async) iterable of disposers；
// disposer 按注册逆序执行，async 会被 await；已 dispose 的 fiber 抛 INACTIVE_EFFECT
```

### 2.4 服务（`lib/types/service.d.ts` + `reflect.d.ts`）

```ts
export declare abstract class Service<out T = never> {
  protected ctx: Context;
  name: string;
  constructor(ctx: Context, name: string);   // 构造即注册 ctx.reflect.provide(name, this, check)
  static readonly init/check/config/invoke/extend/tracker/resolveConfig: unique symbol;
}
ctx.provide<K extends string & keyof this>(name: K, value: undefined | this[K]): () => void;
```

DSH 惯例：`class X extends Service { static Config = z.object({...}); constructor(ctx, config) { super(ctx, 'serviceName'); ... } }`。

### 2.5 消费：inject / get / 代理读

```ts
ctx.inject(deps: Inject, callback: Plugin.Function<void>): Fiber & PromiseLike<Fiber>;
ctx.get<K extends string & keyof this>(name: K, strict?: boolean): undefined | this[K];  // 无 inject 要求，总返回可能 undefined
// ctx[name] 代理读：通过 internal/get waterfall 解析，缺失时抛错；类型来自 Context 接口增强
```

### 2.6 ctx.remote（DSH/Typert 扩展，非 cordis）

`ctx.remote` 由 `dsh-api-gateway` client 安装（Typert RPC）；`ctx.remote.$on` 的 key **仅限** `API_REMOTE_FORWARDED_EVENTS` 11 项白名单（`settings/document-updated`、`llm/adapters-updated`、`cordis/request-run` 等）。任意 cordis 事件不能假设会到达 `ctx.remote.$on`。

---

## 3. 会话事件源（`dsh-session`）

### 3.1 订阅（`dsh-session/lib/types/index.d.ts`）

```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    'session/created'(this: Scoped<Session>, session: Session): void;           // @mode emit
    'session/disposed'(this: Scoped<Session>, session: Session): void;          // @mode emit
    'session/event'(this: Scoped<Session>, session: Session, event: SessionEvent): void;  // @mode emit
    'session/flush'(this: Scoped<Session>, session: Session): Promise<void> | void;       // @mode parallel
  }
  interface Context { sessions: SessionStore; }
}
```

- **`session/event` 是全局火线（所有 live 会话）**，post-commit 触发、观察者失败被日志吞掉（不阻塞 append）。
- 事件封套：`SessionEvent = { type, seq, time, data, ignorable? }`（+ surface 事件带 `sourceEventSeqs?/surfaceOp?`）。
  - `seq` = 该会话日志长度（连续单调，**幂等键 = (session.id, event.seq)**）
  - `time` = Unix epoch ms（append 时间，**唯一时间戳**）
  - `data` 为 frozen JSON。

### 3.2 SessionEventMap 关键条目（`dsh-session/lib/types/types.d.ts` 原文）

```ts
interface SessionEventMap {
  'turn/start': { turn: number };
  'turn/end': { turn: number; reason: TurnEndReason };
  'step/start': { turn: number; step: number };
  'step/end': { turn: number; step: number };
  'assistant/chunk': { turn: number; step: number; chunk: StreamChunk };
  'assistant/message': { turn: number; step: number; message: AssistantMessage; usage?: TokenUsage };
  'request/header': { header: EpochHeader; reason: 'initial' | 'resume' | 'change' };
  'request/context': RequestContext;                    // { provider, model, contextWindow? }
  'tool/call': { turn: number; step: number; callId: CallId; name: string; arguments: string };
  'tool/result': { turn: number; step: number; message: ToolResultMessage; error?: {...}; meta?: JsonValue };
  'session/end-seed': Record<string, never>;
  // …（运行时词汇更宽：session/title、compaction/*、llm/retry、approval/*、goal/change 等由声明合并扩展）
}
```

```ts
type TurnEndReasonMap = {
  completed: { kind: 'completed' };
  aborted: { kind: 'aborted'; reason: TurnEndCancelCause };      // user/parent/hook/disposed/legacy
  blocked: { kind: 'blocked' };
  error: { kind: 'error'; error: LlmFailure };
  'max-tokens': { kind: 'max-tokens' };
  interrupted: { kind: 'interrupted' };
};
```

**关键事实（与架构文档假设的差异）**：
1. **没有 requestId**：会话事件中不存在 per-request id；provider 的 requestId 只出现在 `LlmFailure.requestId?`（错误载荷内）。→ 请求关联键 = `(sessionId, turn, step)`。
2. **assistant/message 上没有 startedAt/completedAt、没有 finishReason**：唯一时间戳是封套 `event.time`；finishReason 在尾部 `assistant/chunk` 的 `finish` 变体或 `turn/end` 的 reason 中。
3. `provider/model` 可从 `assistant/message.message.source`（`ModelMessageSource { kind:'model', provider, model }`）或 `request/header`/`request/context` 取得。
4. `tool-calls` 不以失败计：`tool/call` 是独立事件；`FinishReason 'tool-calls'` 是正常结束。

### 3.3 错误事件（`agent/request-error` 不在 session/event 上）

`agent/request-error` 是 `dsh-agent` 运行时的 **waterfall** 事件（`{ agent, turn, step, provider, failure, retryPolicy, signal }, next`），**不是** durable session 事件。durable 错误事实在 `turn/end` reason `{kind:'error', error: LlmFailure}`（以及 `StreamChunk finish {kind:'error'|'aborted', failure}`）。→ 分析器以 `turn/end` 的 reason 为错误权威来源。

### 3.4 Replay / 种子边界（幂等与回放）

```ts
readonly firstLiveSeq: number;   // 本进程第一个 append 的 seq（构造函数种子 = 0）
// 构造函数种子（resume/fork/replay）从不发布 session/event —— 'constructor seeds do not emit'
// durable 投影：日志中的最后一个 'session/end-seed' 事件
```

- 进程内：`event.seq >= session.firstLiveSeq` 即 live 事件。
- 离线回放历史：`ctx.sessionQuery.readSession(id)` → `SessionLogSnapshot`（`ctx.sessionQuery` 是 `SessionQueryEngine`：`readSession/listEvents/readEvent/filterEvents/readSurface/traceSession/...`），或持久化后端 `readFrom(id, fromSeq)`。
- `Session` 类（`ctx.sessions` 返回）无 per-session 事件发射器；过滤 = 回调里比较 `session.id`。

### 3.5 Session 便捷面

```ts
session.id; session.seq; session.firstLiveSeq; session.events;
session.requestHeader(): EpochHeader | undefined;   // 最新 request/header 折叠
session.requestContext(): RequestContext | undefined;
session.deriveMessages(): Message[];               // 派生消息历史（frozen）
```

---

## 4. Token 语义（`dsh-llm` + `dsh-token-meter`）

### 4.1 TokenUsage（`dsh-llm/lib/types/types.d.ts` 原文）

```ts
export interface TokenUsage {
  inputTokens: number;        // 未缓存输入（disjoint！）
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;   // 已包含在 outputTokens 中，不得再累加
}
```

- **bucket 互斥（disjoint）**：`inputTokens` 只含未缓存输入；计费输入 = input + cacheRead + cacheWrite。适配器会把 provider 折叠进 total prompt 的缓存命中数（如 DeepSeek `prompt_tokens`）减去。
- → 验证架构文档 §10：`total = input + cacheRead + cacheWrite + output` 与官方语义一致，但必须以互斥 bucket 解释。
- **TokenUsage 无 source 字段**：`PROVIDER/ESTIMATED/UNKNOWN` 不是类型的一部分 → 由插件判定：
  - `assistant/message.usage` 存在 → `PROVIDER`
  - 无 usage 但可用 token-meter 估计（`ctx.tokenMeter.measure/estimateMessage`）→ `ESTIMATED`
  - 其余 → `UNKNOWN`

### 4.2 StreamChunk（usage/finish 变体）

```ts
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: CallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }        // 临时 usage，先于 finish
  | { type: 'finish'; reason: FinishReason; replayState?: unknown };
```

```ts
interface FinishReasonMap {
  'stop': { kind: 'stop' };
  'tool-calls': { kind: 'tool-calls' };
  'max-tokens': { kind: 'max-tokens' };
  'aborted': { kind: 'aborted'; failure: LlmFailure };
  'error': { kind: 'error'; failure: LlmFailure };
}
```

- **provisional → final 规则**（验证架构文档 §5.2）：`assistant/chunk` 的 `usage` 变体是临时值；`assistant/message.usage` 是最终值，收到后**替换**同 `(turn, step)` 的临时记录，绝不相加。`@deepseek-ai/dsh-llm/message` 的 `isTokenDelta(chunk)` 可判断文本增量块。

### 4.3 token-meter 服务（`dsh-token-meter/lib/types/index.d.ts`）

```ts
declare module '@deepseek-ai/cordis' { interface Context { tokenMeter: TokenMeter; } }
class TokenMeter extends Service {
  static Config: z<TokenMeterConfig>;
  measure(session: Session, requestHeader?: EpochHeader): TokenMeasurement;  // 请求压力+表面，O(surface)
  estimateMessage(message: Message): number;                                  // 单条消息启发式定价
}
```

- token-meter 的投影单位：`tokenUsageProjectionDefinition`（key `'tokenUsage'`，值 `TokenUsageProjection { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }`）、`contextPressureProjectionDefinition`、`contextBreakdownProjectionDefinition`（`dsh-token-meter/lib/types/usage-projection.d.ts` + `projection.d.ts`）。
- **本插件不重新实现 Token 语义**：最终 usage 直接从 `assistant/message.usage` 读取；估算仅在无 provider usage 时使用 token-meter 能力（Phase 2+）。

---

## 5. 会话投影注册（`dsh-session-projection`）

### 5.1 注册 API（`dsh-session-projection/lib/types/index.d.ts` 原文）

```ts
declare module '@deepseek-ai/cordis' { interface Context { sessionProjections: SessionProjectionRegistry; } }

interface ProjectionDefinition<K extends keyof SessionProjectionMap, S> {
  key: K;
  schema: ZodType<SessionProjectionMap[K]>;   // 出 host 前校验 view 输出
  init(): S;
  apply(state: S, event: SessionEvent): S;    // 纯同步；无关事件必须返回同一引用（Object.is）
  view(state: S): SessionProjectionMap[K];
  stateVersion: number;                        // 持久化缓存失效版本
}

class SessionProjectionRegistry extends Service {
  register<K extends keyof SessionProjectionMap, S>(definition: ProjectionDefinition<K, S>): () => void;
  onChanged(listener: ProjectionChangeListener): () => void;
  snapshot(session: Session): ProjectionSnapshot;        // 一致读切面 { asOfSeq, values }
  checkpoint(session: Session): ProjectionCheckpoint;    // 持久化缓存写面
  restoreFloor(checkpoint): number | undefined;
  viewCheckpoint(checkpoint): Partial<SessionProjectionMap>;
  restore(checkpoint, events, baseSeq): { snapshot; checkpoint };
}
```

- 新 key 通过声明合并注册进类型表：

```ts
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap { usageAnalytics: {...}; }
}
```

- 注册是调用 fiber 的 effect：卸载即移除 key。`dsh-session-stats` 的完整范例（`lib/index.js`）：

```ts
const name = "session-stats";
const inject = ["sessionProjections"];
function apply(ctx) {
  ctx.sessionProjections.register(sessionStatsProjectionDefinition);
}
```

- **耗时折法（官方范例，验证架构文档 §7）**：模型耗时 = `step/start.time → assistant/message.time`（`llmMs += max(0, event.time - startTime)`）；首个 token = 首个非空 delta chunk；decode = 首 token → assembled message（当该 step 报了 output tokens）；tool 耗时 = `tool/call.time → tool/result.time`（按 callId 配对）。`step/end` 是 step 计数的权威事件（completed/failed/cancelled/max-tokens 都恰好一个）。

---

## 6. 存储（SQLite）

### 6.1 官方模式（`dsh-session-query-sqlite/lib/index.js`）

- 驱动：`await import("node:sqlite")` → `DatabaseSync`（同步 API）。
- 路径：`:memory:` 或 `resolve(path)`；缺失目录 `mkdir(dirname, {recursive, mode: 448})`；新文件 `open(path, "wx", 384)`（owner-only）。
- 保护：`PRAGMA application_id`（防误用他人 DB）；`PRAGMA user_version` 作为 schema 版本（不兼容时原地重置，`DROP TABLE IF EXISTS` + `user_version = 0`）；`PRAGMA journal_mode = WAL`。
- 建表用 `STRICT` 表。
- `openAt` 配置（`startup` / `first-search` / `never`）控制惰性打开。

### 6.2 路径助手（`dsh-home-paths/lib/types/index.d.ts`）

```ts
resolveDshHome(configured?, env?): string;   // 显式配置 > $DSH_HOME > ~/.dsh
dshHomePath(...segments: string[]): string;  // 拼接在解析后的 home 上
```

### 6.3 本插件 Phase 2 采用

独立 DB 文件 `dshHomePath('usage-analytics', 'usage.sqlite')`；`application_id` + `user_version` 版本化迁移；WAL；STRICT 表；参数化 SQL；异步批量写入（不阻塞 agent 主流程）。

---

## 7. UI 客户端（API LOCKED — 对 Phase 4 页面方案有决定性影响）

### 7.1 Client 上下文与服务（`dsh-client-runtime/lib/types/client/*`）

- `ctx.slots` 是 `SlotRegistry extends Service`：`slots.register({name, children?, store?, locale?, registrant?, ...kindOptions}, component): () => void`；`slots.inject(key, callback)` 是**声明期依赖钩子**，不是注册调用。
- 标准 props：会话作用域 `{useSession, sessionId, useProjection}`；全局 kit `{useSessions, useWorkspaces}`。
- Client 上下文完整表面：`slots, sessions, workspaces, conversationEvents, conversationViews, modules, remote, typert, locale, layout, conversation, inputTriggers, settingsScope, theme`。**不存在通用 `clientRuntime`/`host` 服务。**

### 7.2 没有独立 Dashboard 页面 Slot（关键限制）

- Frame 座位：`root`（禁止注册——会替换整个 AppFrame）、`sidebar`、`conversation`、`details`（均为 single，注册即替换已占用者——文档化的反模式）、`shell.overlay`（list/root 加法浮层）。
- 最接近"页面"的座位：`conversation.view`（list/session 页签，trajectory 即此模式：`id: 'trajectory'`, `order: 10`）与 `settings.section`（list/root 模态内整页）。新 Slot 只能通过已占用条目的 `children:` 声明，不能独立声明。
- → **Phase 4 Dashboard 的现实方案**：(a) `conversation.view` 注册会话内 Usage 页签（可复用 session 标准 kit：`useSession`/`useProjection`/`sessionId`）；(b) `settings.section` 注册 root 作用域统计页（只拿到全局 kit，数据需经 Typert RPC 拉取）；(c) `shell.overlay` 浮层。**取舍已定并落地：`sidebar.footer.action` 按钮 + `shell.overlay` 全屏弹窗（见 §7.2.1）**。

标准注册模式（目标 slot 由其他包声明时必须与 `slots.inject` 配对，保证声明期顺序安全）：

```js
// settings.section 范例（对照 dsh-client-ui-settings-models/lib/client.js）
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section',
  id: 'usage-analytics',        // list 槽位：id 为节键，order 为导航位置，label 为导航文案（可懒求值）
  order: 20,
  label: () => 'Usage Analytics',
  inject: injected,             // 可选：注入面（hooks 舱）
}, AnalyticsSection));
```

### 7.2.1 已验证组合：侧栏按钮 + `shell.overlay` 全屏弹窗（dsh-usage-analytics 实测）

设置弹窗固定 800px（`dsh-client-ui-settings-general` SettingsRoot 的 `.VOzbGW_panel`：
`width: 800px; max-width: calc(100vw - 48px)`，z-index 1000，导航栏 188px），
不适合放宽表页面。实测可用组合：

- **入口**：`sidebar.footer.action`（由 dsh-client-ui-sidebar 的 `sidebar` 条目声明，
  kind `list` / scope `root`，渲染在设置齿轮上方）；条目只接收 owner prop `{ wide: boolean }`
  （侧栏是否展开）。注册方式与 settings.section 相同：`slots.inject('sidebar.footer.action', ...)`。
- **弹窗**：`shell.overlay`（AppFrame 声明，kind `list` / scope `root`）——
  渲染在 `.overlayLayer`（z-index 20，`pointer-events: none`，直接子元素恢复 `auto`）；
  条目常驻挂载，关闭时组件返回 `null` 即可。宽度完全自控（实测 `min(1200px, calc(100vw - 64px))`）。
- **打开 / 关闭**：模块级单例 store（open 布尔 + subscribe）+ `useSyncExternalStore`；
  侧栏按钮写入 open，弹窗订阅；关闭 = 右上角 × / 点遮罩 / ESC。
- **从设置内打开的限制**：设置弹窗 z-index 1000 高于 overlay 层 20，从设置内打开大弹窗必须先关闭设置；
  `settings.section` 条目会收到 owner prop `close`（设置弹窗的关闭函数）。
- **类型**：`slots.inject` 的 key 需要 SlotMap 增强，来自声明方 client 类型：
  `@deepseek-ai/dsh-client-ui-sidebar/client`、`@deepseek-ai/dsh-client-ui-layout/client`
  （在本仓库 tsconfig paths 中按惯例追加指向本机 DSH 安装的路径）。

标准注册示例：

```js
// 侧栏按钮（展开态 wide=true 显示文字，收起态仅图标）
ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
  name: 'sidebar.footer.action',
  id: 'usage-analytics-open',
  order: 0,
}, SidebarUsageButton));

// 全屏弹窗（关闭时组件返回 null）
ctx.slots.inject('shell.overlay', () => ctx.slots.register({
  name: 'shell.overlay',
  id: 'usage-analytics-overlay',
  order: 100,
  inject: () => ({ usage }),
}, UsageOverlay));
```

### 7.3 Host↔Client RPC（打包插件用 Typert，非 harness.handle）

- `harness.handle` / `host.call` **仅由动态 cordis-run（dsh-cordis-host-runner / dsh-cordis-client-runner）注入**，打包插件不可用。
- 打包双半插件的 RPC = **Typert**：client 侧 `ctx.remote`（`TypertClientRemote` + `$on`/`$mount`/生成命名空间），host 侧 `TypertRemoteService` / `@Remote` 贡献。`ctx.remote.$on` 仅限 11 项白名单事件。

### 7.4 构建与依赖

- **React 不是全局**：client bundle `require("react")`，由 shell 的静态模块 seed 解析；peer deps = `react ^18.2.0` + `@deepseek-ai/cordis ^4.0.1` + dsh-client-runtime/locale/primitives/invariants。
- client bundle 由 **tsdown** 预构建为 `lib/client.js`（`window.__ModuleLoader__.load({id, factory})` CJS 包装），Host `ClientModuleRegistry` 以 `/plugins/<id>/client.js?rev=<rev>` 提供。

---

## 8. 与架构文档的偏差清单（实现时必须遵守）

| 架构文档假设 | 实际 API 事实 | 影响 |
|---|---|---|
| `usage_record.request_id` | 会话事件无 requestId | 关联键 = `(session_id, turn, step)`；幂等键建议 `(session_id, seq)` |
| `started_at/completed_at` 来自事件 | 只有封套 `event.time` | 起始时间 = 关联的 `step/start.time`（或首次 `assistant/chunk.time`）；完成 = `assistant/message.time`；LLM Duration = 两者之差（对齐 session-stats） |
| `assistant/message` 带 finishReason | 无；finishReason 在尾部 `finish` chunk / `turn/end` reason | 从这两处归一化 |
| `agent/request-error` 在 session/event | 在 dsh-agent 总线（waterfall），非 durable | 错误权威 = `turn/end` reason `error`（含 `LlmFailure`）；`max-tokens`/`aborted` 同理 |
| `usage_source` 来自 TokenUsage | TokenUsage 无 source 字段 | 插件判定：有 usage → PROVIDER；token-meter 估算 → ESTIMATED；否则 UNKNOWN |
| 插件形如 `{config, using}` | Cordis v4：`Config`（校验器）+ `inject`，无 `using` | 按 §2.1 写插件 |
| 投影"注册 usageAnalytics" | `sessionProjections.register(ProjectionDefinition)` + 类型表声明合并 | 按 §5 实现 |
| SQLite 自有迁移 | `node:sqlite` + `PRAGMA user_version`（+ application_id + WAL + STRICT） | 按 §6 实现 |
| 插件经 `cordis_define` 动态注册 | 本插件走**打包插件**（补丁行/bundle），动态插件无持久化能力 | 按 §1 部署 |

## 9. Phase 1（Collector）据此锁定的设计决定

1. 订阅 `ctx.on('session/event', (session, event) => …)`；用 `session.firstLiveSeq` 区分 live/seed（种子不发事件，故 Collector 天然只见 live）。
2. 请求记录键：`(sessionId, turn, step)`；幂等由插件存储层（Phase 2）以 `(sessionId, seq)` 唯一约束保证；Collector 内以 `(sessionId, turn, step)` 维护活跃状态。
3. 状态机：`step/start` →（open）→ `assistant/message`（finalize，PROVIDER usage）或 `turn/end`（finalize，ERROR/ABORTED/MAX_TOKENS，无 usage 标记）或 `step/end`（无消息时 close）。
4. `assistant/chunk` 仅更新内存中的 provisional usage / finish，不落库；`assistant/message` 一次性产出最终 UsageRecord。
5. 请求状态映射：`turn/end reason` → SUCCESS/ERROR/ABORTED/MAX_TOKENS；`tool-calls` finish 不视为失败。
6. 全链路 fail-open：任何异常仅记日志，绝不抛出到事件分发链。
