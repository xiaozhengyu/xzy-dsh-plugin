# 用量分析 UI 优化 — 设计文档

> 日期：2026-08-16
> 状态：已获用户批准（对话确认 A 方案：Tab 分页）
> 适用范围：`dsh-usage-analytics` client half（`settings.section` 座位）

## 1. 背景与目标

当前用量分析页面只有英文内容、菜单名为 `Usage Analytics`，且请求历史只有“最近 10 条”，
没有筛选、排序、分页。本轮目标：

1. 菜单改名为「用量分析」。
2. 页面内容全部中文化。
3. 页面内改为 Tab 结构：「概览」与「请求历史」。
4. 请求历史支持时间预设、Provider / Model / 状态筛选、关键词搜索、列排序、分页。

## 2. 非目标（后续轮次）

- 请求详情 / Session 详情下钻。
- 趋势图表升级（SVG/Canvas 手写柱状图）。
- CSV / JSON 导出。

## 3. 页面结构

`settings.section` 座位内渲染一个标题「用量分析」+ 两个 Tab：

```text
用量分析
[ 概览 ] [ 请求历史 ]
```

### 3.1 概览 Tab

保留现有内容，仅中文化：

- 时间切换：今天 / 近 7 天 / 近 30 天
- 指标卡片：请求数、总 Tokens、输入、缓存读、缓存写、输出、成功率、缓存命中、平均耗时、P95、Tokens/请求
- 每日趋势（CSS 条形）
- Provider 分布表、Model 分布表
- 最近请求表、会话排行表

### 3.2 请求历史 Tab

独立于概览的状态（范围预设、筛选、分页各自维护）。

**筛选行**

- 时间预设：今天 / 近 7 天 / 近 30 天
- Provider 下拉：选项来自当前范围 `getProviderStats`
- Model 下拉：选项来自当前范围 `getModelStats`
- 状态下拉：成功 / 错误 / 中断 / 达到上限 / 未知（映射 SUCCESS / ERROR / ABORTED / MAX_TOKENS / UNKNOWN）
- 搜索框：对 sessionId / provider / model / 错误信息做子串匹配（后端 `search` 已支持）

**表格列**

| 时间 | Provider | Model | 输入 | 缓存读 | 缓存写 | 输出 | 总量 | 耗时 | 状态 |

- 时间、总量、耗时三列可点击表头切换升 / 降序
- 每页 20 条；上一页 / 下一页 + 当前页 / 总页数

**状态文案**

- 空态：「该范围内没有请求记录，换个时间范围或清除筛选条件试试。」
- 错误态：「加载失败：{message}」+ 「重试」按钮
- 加载态：「加载中…」

## 4. 数据流

全部复用现有 Typert remote，零后端改动：

- `getOverview` / `getTrend` / `getProviderStats` / `getModelStats` / `listSessions` — 概览
- `listRequests({ from, to, provider, model, status, search, sortBy, order, offset, limit })` — 请求历史

筛选、排序、分页均由后端 `listRequests` 完成，前端只传参数并渲染结果。

## 5. 中文化文案

直接硬编码中文（个人插件，不接入 `ctx.locale` 系统）。统一词汇表：

| 英文（现状） | 中文 |
|---|---|
| Usage Analytics | 用量分析 |
| Overview | 概览 |
| Request History | 请求历史 |
| Requests | 请求数 |
| Total Tokens | 总 Tokens |
| Input | 输入 |
| Cache Read | 缓存读 |
| Cache Write | 缓存写 |
| Output | 输出 |
| Success / Success Rate | 成功 / 成功率 |
| Cache Hit | 缓存命中 |
| Avg Duration | 平均耗时 |
| P95 | P95 |
| Tokens/Req | Tokens/请求 |
| Today / 7d / 30d | 今天 / 近 7 天 / 近 30 天 |
| Time / Provider / Model / Duration / Status | 时间 / Provider / Model / 耗时 / 状态 |
| Loading… | 加载中… |
| Retry | 重试 |
| SUCCESS / ERROR / ABORTED / MAX_TOKENS / UNKNOWN | 成功 / 错误 / 中断 / 达到上限 / 未知 |

## 6. 实现说明

- `src/client/client.ts`：`label: () => '用量分析'`。
- `src/client/Dashboard.tsx`：改为 Tab 壳，拆分出 `OverviewPanel.tsx`（现有内容迁移）与
  `RequestHistory.tsx`（新增）；共享格式化函数抽到 `format.ts`。
- 样式沿用 Harness 主题变量（`--theme-*`），不引入第三方库。
- 客户端 bundle 由 `scripts/bundle-client.mjs` 重新构建。

## 7. 验证

1. `pnpm --filter dsh-usage-analytics typecheck`
2. `pnpm --filter dsh-usage-analytics test`
3. `pnpm --filter dsh-usage-analytics build`
4. 重装到 web profile 并重启 harness；浏览器验证：菜单名、中文文案、Tab 切换、
   筛选 / 排序 / 分页、空态与错误态。
