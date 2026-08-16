# dsh-usage-analytics

DeepSeek Harness 的 LLM Usage Analytics / Observability 插件（个人项目）。

> **状态：核心功能已完成并稳定运行** —— 采集 → SQLite 台账 → 查询服务 → UI 2.0 全部落地。
> 数据保留策略（明细 60 天 / 日聚合 360 天）已按《数据保留策略与存储架构》实施。

## 功能

- **采集**：订阅 Harness `session/event` 全局火线，归一化每次 LLM 调用的
  usage / cache / latency / status；provisional → final 替换、幂等、fail-open。
- **台账**：SQLite（`node:sqlite`，STRICT 表 + WAL + 参数化 SQL），异步批量写入，migration 版本化。
- **查询**：Overview / Trend / Provider / Model / Session / Request History
  （筛选、搜索、排序、分页）。
- **UI 2.0**：侧栏「用量」按钮 + 全屏弹窗；概览（KPI 分层、Token 用量、性能、
  SVG 趋势、Provider/Model Bar、会话排行、最近请求）+ 请求历史（含请求详情抽屉）。
- **保留策略**：请求明细 60 天、日聚合 360 天、raw 事件 7 天，均可配置。

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
UsageLedger           —— SQLite 台账
  ├─ AsyncBatchWriter     —— 内存缓冲 + 去抖批量事务写入（不逐条落库）
  ├─ UsageRepository      —— 参数化 SQL，幂等 (session_id, seq)，会话下推 listBySession
  ├─ DailyStatsRepository —— 日聚合表（usage_daily_stats，幂等重算，本地时区日键）
  ├─ Migration            —— PRAGMA user_version 版本化迁移（001/002/003）
  └─ RetentionService     —— 定期清理（明细 60d / 聚合 360d / raw 7d，可配 'forever'）
      ↓
UsageService          —— 查询门面（ledger.query() 获得）
  ├─ StatisticsService —— 纯聚合数学（overview/trend/provider/model/session + 百分位）
  └─ UsageRepository   —— SQL 过滤/排序/分页（listRequests）
      ↓
UsageRemoteService    —— Typert 远程服务（usageAnalytics 命名空间，供 client 调用）
      ↓
Client（React）
  ├─ SidebarUsageButton —— 侧栏底部「用量」按钮（sidebar.footer.action）
  └─ UsageOverlay       —— 全屏弹窗（shell.overlay）：概览 / 请求历史 + 详情抽屉
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

## 数据模型与保留策略

| 表 | 内容 | 默认保留 |
|---|---|---|
| `usage_record` | 请求明细（幂等键 `(session_id, seq)`） | 60 天 |
| `usage_daily_stats` | 日聚合（`UNIQUE(day, provider, model)`，本地时区日键） | 360 天 |
| `usage_raw_event` | 原始事件（当前无生产者，schema 就绪） | 7 天 |

日聚合由 `DailyStatsRepository.recompute()` 幂等重算（启动 + 每 5 分钟），
重放不会重复计数；超出明细保留期的历史日不会被重算触碰，天然保留。
详见 `doc/DSH-Usage-Analytics-数据保留策略与存储架构建议.md`。

## 查询 API（`UsageLedger.query()` 获得）

```ts
const q = ledger.query();
const day = { from: Date.now() - 24 * 3600 * 1000, to: Date.now() };

q.getOverview(day);                    // 仪表盘卡片：tokens/cache/成功率/延迟百分位/效率
q.getTrend(day, 'day');                // 连续趋势（day 粒度读 usage_daily_stats，其余读明细）
q.getProviderStats(day);               // 按 provider 聚合
q.getModelStats(day);                  // 按 provider+model 聚合
q.listRequests({ from: day.from, to: day.to, status: 'ERROR', sortBy: 'duration', order: 'desc', offset: 0, limit: 50 });
q.getRequest(id);                      // 单条请求
q.listSessions(day);                   // 按 session 聚合（computed view）
q.getSession(sessionId);               // session 详情 + 请求列表
```

时间范围 `[from, to)`（`to` 排他）；`to` 缺省表示无上界。

## UI 入口（侧栏按钮 + 全屏弹窗）

唯一入口是侧栏底部 `sidebar.footer.action` 的「用量」按钮（展开态显示图标 + 文字，收起态仅图标），
点击打开 `shell.overlay` 全屏弹窗（最大 1200px 宽），包含两个 Tab：

- **概览**：核心 KPI（请求数 / 总 Tokens / 成功率 / 缓存命中）、Token 用量与性能分区、
  SVG 趋势图（Tokens / 请求数切换）、Provider / Model 横向 Bar、会话排行、最近请求；
  支持今天 / 近 7 天 / 近 30 天 / 自定义时间范围、自动刷新（30s）与手动刷新。
- **请求历史**：时间预设 + Provider / Model / 状态筛选 + 关键词搜索 + 排序 + 分页；
  点击行打开**请求详情抽屉**（Token 明细含缓存读/写拆分、TTFT、状态、完成原因、错误等）。

关闭方式：右上角 ×、点遮罩、ESC。设置弹窗固定 800px 且 z-index 高于 overlay 层，
因此本插件不再使用 `settings.section` 入口。相关文件：
`src/client/SidebarUsageButton.tsx`（按钮）、`src/client/UsageOverlay.tsx`（弹窗）、
`src/client/overlay-store.ts`（开关状态）、`src/client/OverviewPanel.tsx` /
`src/client/RequestHistory.tsx` / `src/client/RequestDetailDrawer.tsx`（页面与抽屉）、
`src/client/ui/`（轻量 Design System）。
此模式的实现细节见 `doc/harness-api.md §7.2.1`，UI 2.0 方案见 `doc/DSH-Usage-Analytics UI 2.0.md`。

## 配置（profile cordis.patch.yml insert 行）

```yaml
- insert:
    - id: usage-analytics
      name: '@xiaozhengyu/dsh-usage-analytics'
      config:
        # dbPath: '$DSH_HOME/usage-analytics/usage.sqlite'  # 默认
        # journalMode: 'wal'
        # flushIntervalMs: 1000      # 批量写入去抖间隔（0 = 手动 flush）
        # flushBatchSize: 100        # 达到该条数立即 flush
        # retention:
        #   usageRecordsDays: 60     # 明细保留（默认 60，或 'forever'）
        #   rawEventsDays: 7
        #   statsDays: 360           # 日聚合保留（默认 360，或 'forever'）
        # retentionIntervalMs: 21600000  # 保留清理周期（默认 6h，0 = 关闭）
        # statsIntervalMs: 300000        # 日聚合重算周期（默认 5min，0 = 关闭）
```

## 测试

```bash
pnpm --filter dsh-usage-analytics test        # vitest 单测（采集/台账/查询/保留/聚合）
pnpm --filter dsh-usage-analytics typecheck
pnpm --filter dsh-usage-analytics build       # tsc + client bundle（esbuild）
```

> 说明：
> - `tsconfig.json` 的 `paths` 把 `@deepseek-ai/*` 类型指向本机 DSH 安装
>   （`C:\Users\xiao\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\*`）。
>   换机器时更新该路径即可。
> - 运行期依赖：`node:sqlite`（Node ≥ 22.5；24.x 稳定）、`@deepseek-ai/dsh-home-paths`（peer）、
>   `zod`（client strict codec）。
> - 迁移以类型化常量内联（与设计文档 `migrations/*.sql` 等价，避免安装包内路径解析）。
> - client bundle 由 `scripts/bundle-client.mjs` 用 esbuild 打包为
>   `window.__ModuleLoader__.load({ id, factory })` 形态。

## 安装到 profile

```bash
cd $env:DSH_HOME\profiles\web
pnpm add "file:E:\Programing\xzy-dsh-plugin\packages\dsh-usage-analytics"
# 然后在 cordis.patch.yml 按上文 insert 行激活；client 侧改动需重启 harness 生效
```

## 发布与安装（分发给其他用户）

包名：`@xiaozhengyu/dsh-usage-analytics`（npm 公开包）。

维护者发布：

```bash
pnpm --filter @xiaozhengyu/dsh-usage-analytics build
pnpm --filter @xiaozhengyu/dsh-usage-analytics pack --dry-run   # 检查发布内容
npm login
npm publish                                                    # 或先 npm version patch/minor
```

用户安装：

```bash
# 环境：DeepSeek Harness（web profile）+ Node >= 22.5
dsh plugin --profile web add @xiaozhengyu/dsh-usage-analytics
```

然后在 profile 的 `cordis.patch.yml` 添加启用行（`name` 必须是完整包名）：

```yaml
- insert:
    - id: usage-analytics
      name: '@xiaozhengyu/dsh-usage-analytics'
      config:
        # 可选：retention / 刷新间隔等
```

重启 `dsh web` 后，侧栏底部出现「用量」按钮。

## 文档索引

- 架构设计：[doc/DSH-Usage-Analytics-Architecture.md](../../doc/DSH-Usage-Analytics-Architecture.md)
- API Lock（DSH v0.1.0-rc.6 实际源码）：[doc/harness-api.md](../../doc/harness-api.md)
- 数据保留与存储架构：[doc/DSH-Usage-Analytics-数据保留策略与存储架构建议.md](../../doc/DSH-Usage-Analytics-数据保留策略与存储架构建议.md)
- UI 2.0 方案：[doc/DSH-Usage-Analytics UI 2.0.md](../../doc/DSH-Usage-Analytics%20UI%202.0.md)

## 功能状态

已完成：采集归一化、SQLite 台账、幂等与保留、查询服务、Typert RPC、UI 2.0（概览 + 请求历史 + 详情抽屉）、
日聚合与 60/360 保留策略。

未做 / 未来：

- CSV / JSON 导出（明细与聚合分别导出）。
- Dashboard 全面切换到聚合表（Provider / Model 分布逐步改用 `usage_daily_stats`）与 360 天预设。
- Raw Event 采集启用（schema 与保留已就绪，暂无生产者）。
- Batch 写入失败 retry / split、请求详情页更完整的字段展示。
