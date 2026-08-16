# dsh-usage-analytics

DeepSeek Harness 的 LLM Usage Analytics / Observability 插件（个人项目）。

> **当前阶段：Phase 3 — Query Service（完成）**。Phase 1 Collector 从 `session/event` 归一化调用，
> Phase 2 异步批量写入 SQLite 台账，Phase 3 提供统计/查询门面（Overview/Trend/Provider/Model/
> Requests/Sessions/Cost）。UI 见 Phase 4。

## 设计

- 设计文档：`doc/DSH-Usage-Analytics-Architecture.md`（仓库根）
- API Lock（基于 DSH v0.1.0-rc.6 实际源码）：`doc/harness-api.md`（仓库根）

## 架构

```text
session/event (全局火线)
      ↓
UsageCollector        —— 事件分发 + fail-open（异常仅记日志，绝不抛出）
      ↓
EventNormalizer       —— 纯函数：SessionEvent → NormalizedEvent（DSH 类型边界）
      ↓
RequestTracker        —— 状态机：step/start → chunks(provisional) → assistant/message(final) / turn/end(权威)
      ↓
UsageRecord           —— onRecord 回调
      ↓
UsageLedger           —— SQLite 台账（Phase 2）
  ├─ AsyncBatchWriter —— 内存缓冲 + 去抖批量事务写入（不逐条落库）
  ├─ UsageRepository  —— 参数化 SQL，幂等 (session_id, seq)
  ├─ Migration        —— PRAGMA user_version 版本化迁移（001 usage_record / 002 usage_raw_event）
  └─ RetentionService —— 定期清理（usage 默认 365d / raw 默认 7d，可配 'forever'）
      ↓
UsageService          —— Phase 3 查询门面（ledger.query() 获得）
  ├─ StatisticsService —— 纯聚合数学（overview/trend/provider/model/session + 百分位）
  ├─ CostService       —— 可插拔定价（provider+model → $/1K tokens，估算成本）
  └─ UsageRepository   —— SQL 过滤/排序/分页（listRequests）
```

### 关键语义（与 DSH rc.6 事实对齐，详见 harness-api.md §8 偏差清单）

- **请求关联键**：`(sessionId, turn, step)`（会话事件中不存在 requestId）。
- **幂等**：`(session_id, seq)` 唯一索引 —— replay/重复事件首次写入生效，绝不重复入账；
  disposal 关闭的无 seq 记录（NULL 不冲突）也允许存在。
- **耗时**：`startedAt = step/start.time`，`completedAt = assistant/message.time`（或 turn/end 的 time）。
- **provisional → final**：`assistant/chunk` 的 usage 只更新内存临时值，`assistant/message.usage` 到达后**替换**（绝不累加）。
- **错误权威**：`step/end` 不关闭已开始的流，`turn/end` reason（error/aborted/max-tokens）才是失败落账点。
- **Usage Source**：有 provider usage → `PROVIDER`；estimate 钩子 → `ESTIMATED`；否则 `UNKNOWN`。
- **fail-open**：任何异常（含 DB 写入失败）只记日志，analytics 降级，Agent 不受影响。

## 查询 API（Phase 3，`UsageLedger.query()` 获得）

```ts
const q = ledger.query();
const day = { from: Date.now() - 24 * 3600 * 1000, to: Date.now() };

q.getOverview(day);                    // 仪表盘卡片：tokens/cache/成功率/延迟百分位/效率
q.getTrend(day, 'hour');               // 连续趋势（空桶补零；hour/day/week/month，日历月）
q.getProviderStats(day);               // 按 provider 聚合
q.getModelStats(day);                  // 按 provider+model 聚合
q.listRequests({ from: day.from, to: day.to, status: 'ERROR', sortBy: 'duration', order: 'desc', offset: 0, limit: 50 });
q.getRequest(id);                      // 单条请求
q.listSessions(day);                   // 按 session 聚合（computed view，§8.3 物化表延后）
q.getSession(sessionId);               // session 详情 + 请求列表
q.getCostOverview(day);                // 估算成本（需要 CostService，Phase 5 接入 pricing）
```

时间范围 `[from, to)`（`to` 排他）；`to` 缺省表示无上界。`usage_session` 目前是查询时计算视图，
未物化为表（设计 §8.3 的物化延后到性能需要时）。

## 配置（profile cordis.patch.yml insert 行）

```yaml
- insert:
    - id: usage-analytics
      name: 'dsh-usage-analytics'
      config:
        # dbPath: '$DSH_HOME/usage-analytics/usage.sqlite'  # 默认
        # journalMode: 'wal'
        # flushIntervalMs: 1000      # 批量写入去抖间隔（0 = 手动 flush）
        # flushBatchSize: 100        # 达到该条数立即 flush
        # retention:
        #   usageRecordsDays: 365    # 或 'forever'
        #   rawEventsDays: 7
        # retentionIntervalMs: 21600000  # 保留清理周期（默认 6h，0 = 关闭）
```

## 开发

```bash
pnpm install                 # 仓库根
pnpm --filter dsh-usage-analytics typecheck
pnpm --filter dsh-usage-analytics test
pnpm --filter dsh-usage-analytics build
```

> 说明：
> - `tsconfig.json` 的 `paths` 把 `@deepseek-ai/*` 类型指向本机 DSH 安装
>   （`C:\Users\xiao\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\*`）。
>   换机器时更新该路径即可。
> - 运行期依赖：`node:sqlite`（Node ≥ 22.5；24.x 稳定）、`@deepseek-ai/dsh-home-paths`（peer）。
> - 迁移以类型化常量内联（与设计文档 `migrations/*.sql` 等价，避免安装包内路径解析）。

## 安装到 profile

```bash
cd $env:DSH_HOME\profiles\web
pnpm add "file:E:\Programing\xzy-dsh-plugin\packages\dsh-usage-analytics"
# 然后在 cordis.patch.yml 按上文 insert 行激活
```
