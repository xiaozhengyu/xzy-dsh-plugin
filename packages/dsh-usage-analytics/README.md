# dsh-usage-analytics

DeepSeek Harness 的 LLM Usage Analytics / Observability 插件（个人项目）。

> **当前阶段：Phase 1 — Collector（不持久化）**。从 `session/event` 流归一化每一次 LLM 调用的
> usage / cache / latency / status，输出结构化 `UsageRecord`。SQLite Ledger 与 Query Service 见 Phase 2/3。

## 设计

- 设计文档：`doc/DSH-Usage-Analytics-Architecture.md`（仓库根）
- API Lock（基于 DSH v0.1.0-rc.6 实际源码）：`doc/harness-api.md`（仓库根）

## 架构（Phase 1）

```text
session/event (全局火线)
      ↓
UsageCollector        —— 事件分发 + fail-open（异常仅记日志，绝不抛出）
      ↓
EventNormalizer       —— 纯函数：SessionEvent → NormalizedEvent（DSH 类型边界）
      ↓
RequestTracker        —— 状态机：step/start → chunks(provisional) → assistant/message(final)
      ↓
UsageRecord           —— 结构化输出（onRecord 回调，Phase 2 接入 Usage Ledger）
```

### 关键语义（与 DSH rc.6 事实对齐，详见 harness-api.md §8 偏差清单）

- **请求关联键**：`(sessionId, turn, step)`（会话事件中不存在 requestId）。
- **幂等**：`(sessionId, event.seq)` 是 durable 幂等键；Collector 内对已 finalize 的 key 重复事件直接忽略。
- **耗时**：`startedAt = step/start.time`，`completedAt = assistant/message.time`（或 step/end / turn/end 的 time）；
  首个 token = 首个 `text-delta` chunk。
- **provisional → final**：`assistant/chunk` 的 `usage` 只更新内存临时值，`assistant/message.usage` 到达后**替换**（绝不累加）。
- **状态映射**：finish chunk / turn/end reason → `SUCCESS | ERROR | ABORTED | MAX_TOKENS | UNKNOWN`；
  `tool-calls` 结束不视为失败。
- **Usage Source**：`assistant/message.usage` 存在 → `PROVIDER`；无 usage 且配置了 estimate 钩子 → `ESTIMATED`；否则 `UNKNOWN`。
- **fail-open**：任何异常（含 onRecord 回调抛错）只记日志，不中断事件分发。

## 开发

```bash
pnpm install                 # 仓库根
pnpm --filter dsh-usage-analytics typecheck
pnpm --filter dsh-usage-analytics test
pnpm --filter dsh-usage-analytics build
```

> 说明：`tsconfig.json` 的 `paths` 把 `@deepseek-ai/*` 类型指向本机 DSH 安装
> （`C:\Users\xiao\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\*`）。
> 源码对 DSH 包**只做类型导入**（`import type`），运行期零依赖，故单元测试无需 DSH 运行环境。
> 换机器时更新该路径即可。

## 安装到 profile（Phase 1 仅为验证，正式安装见 Phase 2+）

```bash
# 在仓库根构建后，用 file: 链接加入 web profile
cd $env:DSH_HOME\profiles\web
pnpm add "file:E:\Programing\xzy-dsh-plugin\packages\dsh-usage-analytics"
# 然后在 cordis.patch.yml 插入：
# - insert:
#     - id: usage-analytics
#       name: 'dsh-usage-analytics'
```
