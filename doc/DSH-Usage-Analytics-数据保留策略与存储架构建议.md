# DSH Usage Analytics 数据保留策略与存储架构

> 适用项目：`xiaozhengyu/xzy-dsh-plugin`  
> 插件：`dsh-usage-analytics`  
> 文档目的：明确请求明细与统计数据的生命周期、SQLite 存储模型、查询策略与后续优化方向。  
> 状态：策略与核心存储架构**已落地**（migration 003 + 幂等聚合 + 分层 retention）；Dashboard 全面切换到聚合数据为后续演进。

---

## 1. 背景

`dsh-usage-analytics` 已形成完整的 Usage Analytics 链路：

```text
Harness Session/Event
        │
        ▼
UsageCollector
        │
        ▼
EventNormalizer → RequestTracker
        │
        ▼
      UsageRecord
        │
        ├────────────────────────────┐
        ▼                            ▼
   usage_record                usage_daily_stats
   60 天明细                    360 天聚合
        │                            │
        ▼                            ▼
  Request History / Session     Dashboard 日趋势
  Detail / 错误排查            （Provider / Model 演进中）
```

数据生命周期明确区分两类：

1. **请求明细数据**：服务于近期排查、请求历史、Session Detail。
2. **统计聚合数据**：服务于长期趋势、Provider / Model 分布。

---

## 2. 核心数据保留策略（已采用）

| 数据类型 | 保留时间 | 主要用途 |
|---|---:|---|
| Request Detail（usage_record） | 60 天 | 请求历史、请求详情、错误排查 |
| Daily Statistics（usage_daily_stats） | 360 天 | 每日 Token 趋势、请求趋势 |
| Raw Event（usage_raw_event） | 7 天 | 原始事件追溯（当前无生产者，schema 就绪） |

核心原则：

> **原始请求明细保留 60 天，聚合统计保留 360 天。**

同时满足：近期请求可追溯、历史趋势可长期保留、SQLite 数据规模受控、Dashboard 不依赖长期扫描原始数据。

---

## 3. 为什么不直接保留 360 天明细

Request Detail 属于事件级数据，每次 LLM 调用一条：

```text
每天 1,000 请求 × 360 天 ≈ 360,000 条明细
每天 5,000 请求 × 360 天 ≈ 1,800,000 条明细
```

桌面端本地 SQLite 并非不能承受，但没有必要为长期趋势保留全部事件级数据。
真正需要长期保留的是聚合事实（某天 / 某 provider / 某 model 的请求数、Token、缓存命中……），
而不是 2026-01-01 每一条请求的完整字段。

生命周期：

```text
Request Detail
      │  60 天内：可查询
      │  超过 60 天：删除
      ▼
Daily Aggregate
      │  360 天内：可查询
      │  超过 360 天：删除
```

---

## 4. 数据模型（已实现）

### 4.1 usage_record（请求明细）

已实现（migration 001）。字段包括：

```text
id / session_id / turn / step / seq
started_at / completed_at / duration_ms
provider / model / context_window
input_tokens / cache_read_tokens / cache_write_tokens / output_tokens
total_tokens / reasoning_tokens
usage_source / finish_reason / status
error_code / error_message / error_request_id
has_tool_calls / first_token_at / ttft_ms
created_at / updated_at
```

幂等键 `(session_id, seq)`：replay / 重复事件首写生效（`INSERT OR IGNORE`），绝不重复入账。

### 4.2 usage_daily_stats（日聚合）

已实现（migration 003）：

```sql
CREATE TABLE usage_daily_stats (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  day                INTEGER NOT NULL,  -- 本地时区自然日键 YYYYMMDD
  provider           TEXT    NOT NULL,  -- NULL 归并为 '(unknown)'
  model              TEXT    NOT NULL,
  request_count      INTEGER NOT NULL DEFAULT 0,
  success_count      INTEGER NOT NULL DEFAULT 0,
  error_count        INTEGER NOT NULL DEFAULT 0,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  total_tokens       INTEGER NOT NULL DEFAULT 0,
  total_duration_ms  INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX idx_usage_daily_stats_day_route
  ON usage_daily_stats (day, provider, model);
CREATE INDEX idx_usage_daily_stats_day
  ON usage_daily_stats (day);
```

唯一键 `(day, provider, model)` 可直接支撑：日趋势、Provider 趋势、Model 趋势、
Token 趋势、请求数趋势、成功率、平均耗时。

---

## 5. 聚合生成方式（已实现：幂等重算）

采用「异步批量聚合」方向，但不引入独立定时任务的增量状态：

```text
UsageRecord
     │
     ▼
AsyncBatchWriter ──► usage_record（事务批量写）
     │
     ▼
DailyStatsRepository.recompute()
     │
     ▼
INSERT … SELECT GROUP BY day/provider/model … ON CONFLICT DO UPDATE
```

- 触发时机：插件启动时执行一次，之后每 5 分钟一次（`statsIntervalMs` 可配置，0 关闭）。
- **幂等**：每次对 `usage_record` 全量 GROUP BY 后 UPSERT，结果只依赖明细事实；
  replay 由明细的 `INSERT OR IGNORE` 保证不重复，重算天然对齐。
- **保留语义**：已超出明细保留期、被 retention 删除的历史日不在 GROUP BY 结果里，
  不会被触碰，聚合行自然保留到自己的 360 天窗口。
- **fail-open**：重算失败仅记日志（`onError`），不影响 Agent / 写入主链路。

---

## 6. Retention Worker（已实现）

`RetentionService` + `UsageLedger` 周期调度：

- 插件启动时执行一次；
- 之后每 6 小时执行一次（`retentionIntervalMs` 可配置，0 关闭）；
- 三类删除各自独立事务内执行，不阻塞 Event Collector 主路径；
- 失败仅记日志（fail-open）。

```text
delete usage_record      WHERE completed_at < now - 60d
delete usage_daily_stats WHERE day          < 本地日(now - 360d)
delete usage_raw_event   WHERE event_time   < now - 7d
```

---

## 7. SQLite 索引（已实现）

```text
usage_record:
  UNIQUE (session_id, seq)                -- 幂等
  (session_id, turn, step)                -- 会话内定位
  (started_at)                            -- 时间范围查询
  (status)                                -- 状态过滤
  (provider, model)                       -- Provider / Model 查询
usage_daily_stats:
  UNIQUE (day, provider, model)
  (day)
usage_raw_event:
  (session_id, event_seq)
  (event_time)
```

---

## 8. Dashboard 查询现状与演进

当前：

```text
Overview 卡片 / Provider / Model / Session   ──► usage_record（实时，60 天内）
每日 Token 趋势（day 粒度）                  ──► usage_daily_stats（本地日聚合）
最近请求 / 请求历史                          ──► usage_record（60 天内）
```

概览卡片暂时保留实时扫描明细，原因：卡片含 P50 / P95 延迟百分位，
简单聚合表无法表达；且当前时间预设（今天 / 7 天 / 30 天）都在 60 天明细窗口内，量级可控。

后续演进（在加入 360 天预设 / 更长范围时再做）：

```text
Dashboard
    ├── Overview      ──► 明细 + 聚合混合（百分位仍走明细）
    ├── Trend         ──► usage_daily_stats（已完成）
    ├── Provider      ──► usage_daily_stats
    ├── Model         ──► usage_daily_stats
    └── Recent Requests ──► usage_record（唯一强依赖明细的区域）
```

---

## 9. 时间与时区模型（已实现）

统一约定：

```text
数据库存储：UTC epoch milliseconds
聚合日键：本地时区自然日（YYYYMMDD）
UI 展示：本地时区
```

- 聚合 SQL 使用 `strftime('%Y%m%d', started_at/1000, 'unixepoch', 'localtime')`；
- 查询侧使用同一 `localDayNumber / localDayStart` 约定生成连续日桶；
- “今天 / 近 7 天 / 近 30 天”边界由 `new Date()` 本地组件计算；
- 明细保留按 `completed_at`（epoch）判定，与时区无关。

未来如支持自定义统计时区，仅需把「本地时区」替换为配置时区，日键约定不变。

---

## 10. Session 查询（已优化）

已把 `scan() + filter(sessionId)` 下推为 SQL：

```sql
SELECT * FROM usage_record
WHERE session_id = ?
ORDER BY started_at ASC, id ASC;
```

配合 `(session_id, turn, step)` 索引，避免全表扫描后内存过滤。

---

## 11. Batch Writer 可靠性

现状（正确且保持）：`AsyncBatchWriter` 缓冲 + 去抖批量事务写入，写入失败仅记日志，
Analytics fail-open，不影响 Harness / Agent 主链路。

可选增强（非 P0，暂不做）：

```text
batch transaction failed
        │
        ▼
      retry → split batch → 定位异常 record
```

---

## 12. 推荐开发优先级（已按当前决策调整）

> 成本分析已按项目决策移除，本清单不再包含 Cost。

### P0（已完成）

1. Retention 分层策略：明细 60 天 / 聚合 360 天 / raw 7 天。
2. Retention Worker：启动 + 周期执行、事务内删除、fail-open。
3. 时间 / 时区模型：聚合日键与查询侧统一为本地自然日。
4. Session 查询下推：`WHERE session_id = ?`。

### P1（进行中 / 待办）

5. Dashboard 全面切换到聚合表（Provider / Model 分布逐步改用 usage_daily_stats）。
6. 加入 360 天预设（Trend 已具备数据源，Overview 卡片需混合查询设计）。

### P2

7. Export：CSV / JSON，明细与聚合分别导出。
8. 请求详情页：Token / Cache 明细、Latency、Status、Error、Session、Provider、Model。
9. Batch 写入失败 retry / split。

---

## 13. 结论

对桌面端、单用户、本地 SQLite 的 Harness 插件：

> **“60 天原始明细 + 360 天统计聚合”是合适的数据生命周期设计。**

原始明细解决“最近发生了什么”，聚合统计解决“长期使用趋势是什么”，
SQLite 保持本地、轻量、无额外依赖。当前阶段重点已从“堆功能”转向“架构稳定”：

```text
Retention ✓
    ↓
Time / Timezone ✓
    ↓
SQL Query ✓
    ↓
Daily Aggregate ✓（Dashboard 全面切换为下一阶段）
    ↓
Export / Detail
```
