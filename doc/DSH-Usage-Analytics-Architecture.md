# DSH Usage Analytics — 插件架构设计

> 基于 DeepSeek Harness 当前 `master` 分支插件机制设计。
>
> 文档版本：v1.0  
> 状态：Architecture Design / Ready for Implementation  
> 项目定位：DeepSeek Harness 的 LLM Usage Analytics / Observability 插件

---

## 1. 项目目标

`DSH Usage Analytics` 是一个运行在 DeepSeek Harness 内部的原生插件，用于持续采集、持久化、分析和可视化 AI 模型调用数据。

目标不是重新实现 Harness 的 Token Meter，而是在官方 `dsh-session`、`dsh-llm`、`dsh-token-meter`、Session Event 和 UI Cordis 能力之上，构建一套完整的 Usage Analytics。

核心关注：

- Token 使用量
- Prompt Cache 使用情况
- Provider / Model 使用分布
- LLM 请求耗时
- 请求成功率 / 错误率
- Session 使用情况
- Token 趋势
- 原始事件追踪
- 数据导出

---

# 2. 核心设计原则

## 2.1 不重复实现 Token Meter

Harness 已经提供：

`@deepseek-ai/dsh-token-meter`

该组件负责：

- Token usage 语义
- Provider usage
- cache read / write
- estimated usage
- replay
- compaction
- projection
- context pressure

本插件不得重新实现这些核心语义。

本插件的职责是：

> 从 Harness 的标准 Session Event / Token Meter 能力获取规范化 usage，并建立面向历史分析的 Usage Ledger。

---

## 2.2 Session Event 是事实来源

核心数据流：

```text
LLM
  ↓
Session Event
  ↓
Usage Analytics Collector
  ↓
Usage Ledger
  ↓
Statistics
  ↓
UI
```

Session Event 是 Harness 的 durable event source。

插件不应该通过以下方式获取模型调用：

- HTTP 抓包
- Provider-specific SDK hook
- 修改 LLM Adapter
- 解析终端输出
- 读取非公开日志文件

除非未来 Harness 官方 API 无法满足某项能力，否则不采用这些方案。

---

## 2.3 Usage Ledger 与 Session Event 分离

Session Event 是 Harness 的 source of truth。

Usage Ledger 是本插件生成的派生数据。

```text
Session Event Log
       │
       ▼
Usage Analytics
       │
       ▼
Usage Ledger
```

不要复制完整 Session Event Log 到自己的数据库。

必要时只保存：

- event id / sequence
- event type
- session id
- request / step 标识
- raw payload reference

---

## 2.4 Provider Usage 优先

Token 数据存在三种来源：

```text
PROVIDER
ESTIMATED
UNKNOWN
```

优先级：

```text
Provider reported usage
        >
Harness estimation
        >
Unknown
```

UI 和统计必须能够区分真实 Provider usage 与估算值。

---

# 3. 功能范围

## 3.1 Usage Dashboard

首页展示：

- Total Tokens
- Input Tokens
- Cache Read Tokens
- Cache Write Tokens
- Output Tokens
- Requests
- Success Rate
- Error Rate
- Average Duration
- P95 Duration
- Cache Hit Rate

支持时间范围：

- Today
- Yesterday
- Last 7 Days
- Last 30 Days
- This Month
- Custom Range

---

## 3.2 Usage Trend

支持按时间聚合：

- Tokens / Day
- Requests / Day
- Duration / Day
- Cache Hit Rate / Day

时间粒度：

- Hour
- Day
- Week
- Month

根据查询范围自动选择合理粒度。

---

## 3.3 Provider Statistics

按 Provider 聚合：

```text
Provider
Requests
Total Tokens
Input
Cache Read
Cache Write
Output
Average Duration
Success Rate
```

---

## 3.4 Model Statistics

按 Model 聚合：

```text
Provider
Model
Requests
Total Tokens
Input
Cache Read
Cache Write
Output
Average Duration
P95 Duration
Success Rate
```

---

## 3.5 Request History

主表：

| 字段 | 说明 |
|---|---|
| Time | 请求开始时间 |
| Provider | 模型提供方 |
| Model | 模型 |
| Input | 未缓存输入 Token |
| Cache Read | 命中缓存 Token |
| Cache Write | 写入缓存 Token |
| Output | 输出 Token |
| Total | 总 Token |
| Duration | LLM 调用耗时 |
| Status | 请求状态 |
| Finish Reason | 完成原因 |

支持：

- 分页
- 时间过滤
- Provider 过滤
- Model 过滤
- Status 过滤
- Session 过滤
- 搜索
- 排序

---

## 3.6 Session Detail

点击 Session 后展示：

```text
Session
├── Started At
├── Ended At
├── Duration
├── Request Count
├── Total Tokens
├── Cache Hit Rate
├── Success Rate
└── Request List
```

Request List 可以进一步查看每一次模型调用。

---

## 3.7 Request Detail

展示：

```text
Request ID
Session ID
Turn
Step

Provider
Model

Started At
Completed At
Duration

Input Tokens
Cache Read Tokens
Cache Write Tokens
Output Tokens
Total Tokens

Usage Source
Finish Reason
Status

Context Window
```

如果存在 Raw Event Reference，则允许查看原始事件。

---

---

## 3.9 Export

支持：

- CSV
- JSON

导出范围：

- Request History
- Session History
- Aggregated Statistics

---

# 4. Harness 集成架构

## 4.1 Host / Client 双端

插件采用双半结构：

```text
DSH Usage Analytics
│
├── Host
│   ├── Event Collector
│   ├── Request Tracker
│   ├── Usage Normalizer
│   ├── Usage Ledger
│   ├── Statistics Service
│   └── Query / RPC
│
└── Client
    ├── Dashboard
    ├── Charts
    ├── Usage Table
    ├── Session Detail
    └── Settings
```

Host 运行在 Harness 服务端 / Plugin Host。

Client 运行在 Harness Web UI。

---

# 5. Event 采集设计

## 5.1 核心事件

优先关注：

```text
session/event
```

内部重点处理：

```text
request/header
request/context

turn/start
turn/end

step/start
step/end

assistant/chunk
assistant/message
```

错误场景关注：

```text
agent/request-error
```

具体事件名称、字段和类型必须直接依赖当前 Harness TypeScript 类型，不允许自行复制类型定义。

---

## 5.2 Usage 获取

推荐优先使用最终：

```text
assistant/message
```

中的 `usage`。

Streaming 阶段可能出现：

```text
assistant/chunk
```

中的临时 usage。

必须避免重复累计：

```text
chunk usage
+
assistant/message usage
```

正确策略：

```text
provisional usage
        ↓
final assistant/message usage
        ↓
replace provisional
```

如果直接使用 `dsh-token-meter` Projection，则优先复用其最终语义。

---

# 6. Request 生命周期

插件内部建立：

`RequestTracker`

逻辑：

```text
request start
    ↓
create active request
    ↓
LLM stream
    ↓
assistant/message
    ↓
request completed
```

错误：

```text
request start
    ↓
agent/request-error / stream error
    ↓
request failed
```

请求状态：

```text
SUCCESS
ERROR
ABORTED
MAX_TOKENS
UNKNOWN
```

`tool-calls` 不应直接被判定为失败。

---

# 7. Duration 定义

插件必须区分：

### LLM Duration

```text
LLM request start
        ↓
assistant/message / stream finish
```

表示模型响应耗时。

### Step Duration

```text
step/start
        ↓
step/end
```

表示一个完整 Agent Step 的耗时，可能包含 Tool Execution。

主 Request History 中的“用时”默认使用：

`LLM Duration`

后续可在详情页同时展示：

- LLM Duration
- Step Duration

---

# 8. 数据模型

## 8.1 usage_record

建议字段：

```text
id
session_id

turn
step

request_id

started_at
completed_at
duration_ms

provider
model

input_tokens
cache_read_tokens
cache_write_tokens
output_tokens
total_tokens

usage_source

finish_reason
status

context_window

error_code
error_message

created_at
updated_at
```

---

## 8.2 usage_raw_event

只保存分析所需的原始事件引用或受控 Raw Payload：

```text
id
session_id
request_id

event_type
event_seq
event_time

payload_json

created_at
```

Raw Event 必须支持配置 retention。

默认不长期保存不必要的大型 payload。

---

## 8.3 usage_session

```text
session_id

started_at
ended_at
duration_ms

request_count

input_tokens
cache_read_tokens
cache_write_tokens
output_tokens
total_tokens

success_count
error_count

created_at
updated_at
```

这是派生聚合表，不是 Session Event 的替代品。

---

---

# 9. Token 计算规则

内部标准字段：

```text
input_tokens
cache_read_tokens
cache_write_tokens
output_tokens
total_tokens
```

缓存字段必须独立存储。

不要直接只存：

```text
cache_hit
cache_miss
```

这样可以支持：

```text
Cache Hit Rate
=
cache_read_tokens / input_tokens
```

如果 Provider 已明确提供 uncached input，优先使用 Provider 的权威值。

---

# 10. Total Token 规则

优先使用 Harness / Provider 给出的 total。

如果没有 total：

```text
total =
input
+ cache_read
+ cache_write
+ output
```

但是必须根据当前 Harness `TokenUsage` 的实际语义确认是否存在互斥 bucket，不能机械相加。

最终实现以 `@deepseek-ai/dsh-token-meter` 当前类型定义为准。

---

# 11. Usage Source

```text
PROVIDER
ESTIMATED
UNKNOWN
```

规则：

```text
Provider usage
    ↓
PROVIDER

Harness estimation
    ↓
ESTIMATED

No usage
    ↓
UNKNOWN
```

统计页面默认优先展示 Provider usage。

---

# 12. Analytics 指标

## 12.1 Token

```text
Total Tokens
Input Tokens
Cache Read
Cache Write
Output Tokens
```

## 12.2 Request

```text
Request Count
Success Count
Error Count
Success Rate
Error Rate
```

## 12.3 Latency

```text
Average
P50
P95
P99
Max
```

## 12.4 Cache

```text
Cache Read Rate
Cache Hit Rate
Cached / Total Input
```

## 12.5 Efficiency

```text
Tokens / Request
Output Tokens / Request
Output Tokens / Second
```

---

# 13. Query API

建议 Host 暴露一个稳定的内部 Query Service：

```text
UsageService
```

接口概念：

```text
getOverview(range, filters)

getTrend(range, granularity, filters)

getProviderStats(range, filters)

getModelStats(range, filters)

listRequests(query)

getRequest(requestId)

listSessions(query)

getSession(sessionId)

exportRequests(query, format)
```

Query Service 不应直接暴露数据库。

---

# 14. Projection

如果 Harness 当前 Projection API 支持第三方注册，建议注册：

```text
usageAnalytics
```

用于 Session Detail 等实时页面。

示例：

```json
{
  "requests": 128,
  "totalTokens": 1820342,
  "inputTokens": 1200342,
  "cacheReadTokens": 620000,
  "cacheWriteTokens": 0,
  "outputTokens": 620000,
  "successCount": 124,
  "errorCount": 4,
  "averageDurationMs": 6820
}
```

Projection 只负责当前 Session 的快速展示，不作为长期历史数据存储。

---

# 15. UI 设计

## 15.1 Dashboard

页面：

`Usage Analytics`

区域：

```text
Overview Cards
        ↓
Token Trend
        ↓
Provider / Model Distribution
        ↓
Recent Requests
```

---

## 15.2 Overview Cards

第一行：

```text
Total Tokens
Input
Cache Read
Output
```

第二行：

```text
Requests
Success Rate
Avg Duration
```

---

## 15.3 Request Table

推荐列：

```text
Time
Provider
Model
Input
Cache Read
Cache Write
Output
Total
Duration
Status
```

桌面端优先。

移动端不是第一阶段目标。

---

## 15.4 Session Detail

使用：

```text
Summary
Token Breakdown
Timeline
Request List
```

---

## 15.5 Settings

设置：

```text
Data Retention
Raw Event Retention
Default Date Range
Refresh Interval
```

---

# 16. 数据库策略

数据库只保存 Usage Analytics 派生数据。

推荐：

`SQLite`

但必须：

1. 使用独立数据库文件
2. 不修改 Harness Session 数据库
3. 使用 Migration
4. 支持数据库版本号
5. 支持安全升级
6. 支持 WAL
7. 使用参数化 SQL
8. 不阻塞 Agent 主流程

---

# 17. 数据写入策略

模型调用结束后：

```text
Session Event
      ↓
Normalize
      ↓
Usage Record
      ↓
Async Persist
```

不要让数据库写入阻塞：

```text
LLM stream
Agent loop
Session event dispatch
```

原则：

> Analytics failure must not break Agent execution.

例如 SQLite 出现：

```text
database locked
disk full
migration error
```

不能导致模型调用失败。

应该：

```text
Log error
Degrade analytics
Continue Harness
```

---

# 18. 数据一致性

Usage Record 应具有幂等键。

推荐：

```text
session_id
+
turn
+
step
```

如果 Harness 已提供稳定 request/event id，则优先使用：

```text
request_id
```

建立唯一约束。

避免：

```text
replay
plugin reload
event duplicate
```

造成重复记录。

---

# 19. Replay 处理

Harness 是 replay-aware 的。

插件必须考虑：

```text
Session reload
Plugin restart
Session replay
```

不能简单：

```text
每收到一个 event
    INSERT
```

应该：

```text
event identity
    ↓
idempotency check
    ↓
upsert / replace
```

对于 provisional usage：

```text
assistant/chunk
```

收到最终：

```text
assistant/message
```

后进行替换。

---

# 20. Compaction 处理

Compaction 不应该让历史 Usage 被重新计算并重复入账。

原则：

```text
Compaction
    ↓
Context changes
    ≠
Historical billing usage changes
```

Usage Ledger 记录的是实际发生的模型调用。

Context Projection 可以变化，但历史 Request Usage 不应因为 compaction 被覆盖。

---

# 21. Error Handling

Analytics Plugin 必须遵循：

> Fail-open

错误分类：

```text
EVENT_PARSE_ERROR
DATABASE_ERROR
MIGRATION_ERROR
QUERY_ERROR
UI_ERROR
```

原则：

```text
Analytics Error
      ↓
Log
      ↓
Continue Harness
```

严禁：

```text
Analytics Error
      ↓
Throw
      ↓
Abort LLM Request
```

---

# 22. Performance

采集层目标：

```text
O(1)
```

单个 Event 不执行复杂聚合。

避免：

- 大量 JSON stringify
- 同步磁盘 IO
- 同步 SQL
- 大型 payload 复制
- 全 Session replay
- 每个 event 查询数据库

建议：

```text
Event
 ↓
small in-memory state
 ↓
async batch write
```

批量提交。

---

# 23. Retention

默认：

```text
Usage Records（请求明细）
    60 days

Daily Statistics（日聚合）
    360 days

Raw Events
    7 days
```

允许用户配置：

```text
7d
30d
60d
90d
365d
Forever
```

请求明细保留 60 天、日聚合保留 360 天：近期请求可追溯，历史趋势可长期保留；
Raw Event 默认短期保留，因为 payload 可能非常大。

---

# 24. 安全与隐私

默认：

> 不保存 Prompt / Completion 正文。

Usage Analytics 默认只保存：

- Token metadata
- Provider
- Model
- Session ID
- Request ID
- Timing
- Status
- Usage

Raw Event 如果保存，也应该：

- 可关闭
- 可配置 retention
- 明确提示用户
- 不默认保存完整上下文

---

# 25. Package 结构

建议：

```text
dsh-usage-analytics/
│
├── package.json
├── README.md
├── LICENSE
├── tsconfig.json
│
├── src/
│   ├── index.ts
│   │
│   ├── plugin/
│   │   ├── UsageAnalyticsPlugin.ts
│   │   └── capabilities.ts
│   │
│   ├── collector/
│   │   ├── UsageCollector.ts
│   │   ├── RequestTracker.ts
│   │   └── EventNormalizer.ts
│   │
│   ├── model/
│   │   ├── UsageRecord.ts
│   │   ├── UsageSession.ts
│   │   └── RawEvent.ts
│   │
│   ├── storage/
│   │   ├── Database.ts
│   │   ├── Migration.ts
│   │   ├── DailyStatsRepository.ts
│   │   ├── UsageRepository.ts
│   │   └── AsyncBatchWriter.ts
│   │
│   ├── service/
│   │   ├── UsageService.ts
│   │   ├── StatisticsService.ts
│   │   └── RetentionService.ts
│   │
│   ├── projection/
│   │   └── UsageProjection.ts
│   │
│   └── client/
│       ├── Dashboard.tsx
│       ├── UsageTable.tsx
│       ├── UsageChart.tsx
│       ├── ProviderStats.tsx
│       ├── ModelStats.tsx
│       ├── SessionDetail.tsx
│       ├── RequestDetail.tsx
│       └── Settings.tsx
│
├── migrations/
│   ├── 001_initial.sql
│   └── 002_indexes.sql
│
└── tests/
    ├── collector/
    ├── storage/
    ├── service/
    ├── projection/
    └── integration/
```

实际目录和文件命名必须以当前 Harness Plugin Package Convention 为最终依据。

---

# 26. 推荐实现阶段

## Phase 0 — API Lock

目标：

确认当前 Harness 实际 API。

必须确认：

- Plugin manifest
- Cordis plugin registration
- `session/event` subscription API
- `SessionEventMap`
- `TokenUsage`
- `dsh-token-meter` public API
- Projection API
- UI Cordis API
- Host / Client bridge
- Extension loading

输出：

`docs/harness-api.md`

---

## Phase 1 — Collector

实现：

```text
UsageCollector
RequestTracker
EventNormalizer
```

要求：

- 不持久化
- 输出结构化 UsageRecord
- 支持 success / error / abort
- 支持 provisional → final usage
- 支持 replay
- 支持幂等

---

## Phase 2 — Usage Ledger

实现：

- SQLite
- Migration
- Repository
- Async Batch Writer
- Retention

---

## Phase 3 — Query Service

实现：

- Overview
- Trend
- Provider
- Model
- Requests
- Sessions

---

## Phase 4 — Native UI

实现：

```text
Dashboard
Request History
Session Detail
Request Detail
Settings
```

---

## Phase 5 — Hardening

实现：

- Replay tests
- Duplicate event tests
- Compaction tests
- DB failure tests
- Migration tests
- Large dataset tests
- Plugin reload tests
- Performance tests

---

# 27. 测试策略

## Unit Test

覆盖：

- Event normalization
- Token calculation
- Usage source
- Status mapping
- Duration
- Cache Hit Rate
- Aggregation

---

## Integration Test

模拟：

```text
session/created
↓
turn/start
↓
step/start
↓
request/header
↓
assistant/chunk
↓
assistant/message
↓
step/end
↓
turn/end
```

验证最终 Usage Record。

---

## Duplicate Test

发送两次相同 event：

```text
event A
event A
```

最终：

```text
1 record
```

---

## Streaming Usage Test

模拟：

```text
chunk usage
chunk usage
final message usage
```

验证：

```text
最终只记录一次
```

---

## Error Test

模拟：

```text
LLM error
```

验证：

```text
status = ERROR
```

同时：

```text
Harness Agent Loop continues according to normal error semantics
```

---

## Database Failure Test

模拟：

```text
SQLite unavailable
```

验证：

```text
Analytics fails
Harness continues
```

---

# 28. 性能目标

插件本身不能成为 Agent 性能瓶颈。

目标：

```text
Event processing overhead
< 1 ms average

Synchronous disk IO
0

Synchronous SQL
0
```

Analytics 写入采用异步批量。

对于高频 streaming chunk：

> 不应每个 chunk 写数据库。

优先：

```text
chunk
 ↓
in-memory aggregation
 ↓
final assistant/message
 ↓
persist
```

---

# 29. UX 原则

UI 必须：

- 简洁
- 信息密度高
- 桌面端优先
- 支持深色模式
- 不干扰 Agent 主界面
- 不自动弹窗
- 不阻塞 Agent

Dashboard 是分析工具，不是主工作区。

---

# 30. MVP 完成标准

V1.0 必须能够完整回答：

### 我今天用了多少 Token？

```text
Total Tokens
```

### 哪个 Provider 用得最多？

```text
Provider Statistics
```

### 哪个 Model 用得最多？

```text
Model Statistics
```

### Cache 命中率是多少？

```text
Cache Hit Rate
```

### 哪些请求最慢？

```text
P95 / Request Duration
```

### 哪些请求失败了？

```text
Status = ERROR
```

### 哪个 Session 最耗 Token？

```text
Session Statistics
```

### 某一次请求到底发生了什么？

```text
Request Detail
```

---

# 31. 非目标

V1.0 不做：

- Prompt 管理
- Completion 内容管理
- Agent 行为修改
- Model Router
- Provider 自动切换
- Prompt Optimization
- Token Budget Enforcement
- 自动限流
- Billing API 对账

这些属于其他产品能力。

---

# 32. 最终架构

```text
                         DeepSeek Harness
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                  │
         dsh-session         dsh-llm        dsh-token-meter
              │                 │                  │
              └─────────────────┼──────────────────┘
                                │
                         session/event
                                │
                                ▼
                    ┌──────────────────────┐
                    │ Usage Analytics      │
                    │                      │
                    │ Event Collector      │
                    │ Request Tracker      │
                    │ Event Normalizer     │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Usage Ledger         │
                    │                      │
                    │ usage_record         │
                    │ usage_session        │
                    │ usage_raw_event      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Statistics Service   │
                    └──────────┬───────────┘
                               │
                               ▼
                         Query Service
                               │
                         Host / Client
                               │
                               ▼
                    ┌──────────────────────┐
                    │ DSH Web UI           │
                    │                      │
                    │ Dashboard            │
                    │ Trend                │
                    │ Provider / Model     │
                    │ Request History      │
                    │ Session Detail       │
                    │ Settings             │
                    └──────────────────────┘
```

---

# 33. 开发原则总结

1. **优先使用 Harness 官方 Plugin API。**
2. **以 `session/event` 作为持久事实流入口。**
3. **复用 `dsh-token-meter` 的 Token 语义，不重复造轮子。**
4. **Provider usage 优先于 estimation。**
5. **Usage Ledger 是派生数据，不替代 Session Event Log。**
6. **Analytics 必须 fail-open，不能影响 Agent。**
7. **Streaming chunk 不直接逐条落库。**
8. **所有 Event 处理必须幂等。**
9. **必须考虑 replay、plugin reload、compaction。**
10. **默认不保存 Prompt / Completion 正文。**
11. **UI 使用 Harness 原生 UI Cordis 扩展机制。**
12. **Host / Client 分离。**
13. **V1.0 以 Analytics 为目标，而不是修改 Agent 行为。**
14. **所有 Harness API 以当前源码类型定义为最终依据。**

---

# 34. 实施前置条件

在开始编码之前，必须完成一次当前 Harness API Lock。

需要从当前源码确认以下内容：

```text
1. Plugin package manifest
2. Cordis Service / Plugin 注册方式
3. session/event 注册方式
4. SessionEventMap 当前完整定义
5. TokenUsage 当前完整定义
6. dsh-token-meter public API
7. session projection 注册方式
8. UI Cordis client extension API
9. Host / Client RPC 机制
10. Extension loading / discovery 机制
```

只有这些内容确认后，才能开始 Phase 1。

原因：

> DeepSeek Harness 当前仍处于 Developer Preview，内部 API 存在 breaking change 风险。

因此本项目的实现必须以**当前源码实际 API**为准，而不是根据文档或旧版本示例猜测。

---

# 35. 项目最终定位

`DSH Usage Analytics` 最终不是一个简单的 Token Counter。

它应该成为：

> **DeepSeek Harness 原生的 LLM Usage Analytics / Observability Plugin**

核心模型：

```text
Usage
+
Cache
+
Latency
+
Provider
+
Model
+
Session
+
Trend
=
DSH Usage Analytics
```

第一版重点保证：

> **数据准确、事件不重复、Agent 不受影响、UI 可用、架构可持续演进。**
