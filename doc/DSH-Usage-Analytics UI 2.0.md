# DSH Usage Analytics UI 2.0 优化方案

>   项目：`xiaozhengyu/xzy-dsh-plugin`
>   插件：`dsh-usage-analytics`
>   目标：在现有功能基本稳定的基础上，对 UI 进行一次产品级重构，重点提升视觉层级、信息架构、交互体验和可维护性。
>   状态：已实现（2026-08-16，Commit `f6967cf` / `0db2714` / `30876f3`）

## 1. 总体目标

当前 UI 已具备完整的：

-   概览
-   KPI
-   Token 趋势
-   Provider / Model 分布
-   Recent Requests
-   Session
-   请求历史
-   筛选、搜索、排序、分页

下一阶段不再以“增加功能”为主，而是把当前界面从：

>   功能完整的开发者面板

提升为：

>   **具有明确视觉层级、统一设计语言和良好信息密度的桌面端 Analytics 产品。**

核心目标：

1.  明确信息层级。
2.  保持 DeepSeek Harness 原生视觉风格。
3.  降低信息噪音，提高可读性。
4.  优化 Dashboard 与 Request History 的交互。
5.  建立轻量 Design System，方便后续继续扩展。

------

## 2. 总体视觉方向

推荐：

```text
Harness Native Theme
        +
Analytics Design System
```

不建议直接引入完整的 Admin Dashboard 视觉体系。

原因：

-   插件运行在 DeepSeek Harness 内。
-   用户已经熟悉 Harness 的视觉语言。
-   应继续使用 Harness CSS Variables。
-   避免插件与宿主 UI 割裂。

------

## 3. Overlay Layout

建议将：

```text
Overlay
└── Panel
     └── Dashboard
```

调整为：

```text
Overlay
├── Header
└── Body
     └── Dashboard
```

其中：

-   Header 固定。
-   Body 独立滚动。
-   Dashboard 内容区域负责自身布局。

目标：

```text
┌─────────────────────────────────────────────────┐
│ 用量分析                         概览 请求历史 × │
├─────────────────────────────────────────────────┤
│                                                 │
│ Dashboard Content                               │
│                                                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

这样 Request History 较长时，Header 和 Tab 不会一起滚动。

------

## 4. Dashboard Header

建议从：

```text
用量分析
概览
请求历史
关闭
```

升级为：

```text
用量分析
模型使用情况与性能

                    概览    请求历史    ×
```

原则：

-   标题突出。
-   副标题弱化。
-   Tab 明确当前状态。
-   Close 按钮保持宿主应用风格。

------

## 5. Overview 信息层级

当前最大的问题之一，是很多 KPI 视觉权重接近：

```text
请求数
总 Tokens
输入
缓存
输出
成功率
缓存命中
平均耗时
P95
Tokens / 请求
```

建议分层。

### 5.1 第一层：核心指标

第一行只放 4 个：

```text
┌────────────┬────────────┬────────────┬────────────┐
│ 请求数     │ 总 Tokens  │ 成功率     │ 缓存命中   │
│ 123        │ 37.49M     │ 100.0%     │ 98.7%      │
└────────────┴────────────┴────────────┴────────────┘
```

用户第一眼应该知道：

>   用了多少、请求多少、成功率如何、缓存效果怎样。

### 5.2 第二层：性能指标

```text
┌────────────┬────────────┬────────────┐
│ 平均耗时   │ P95        │ Tokens/请求│
│ 9.2s       │ 28.4s      │ 304.8K     │
└────────────┴────────────┴────────────┘
```

------

## 6. Token Usage

建议把 Token 拆解单独放在一个区块：

```text
Token Usage
────────────────────────

Input             478.7K
Cache Read        36.89M
Cache Write           —
Output            126.5K

Total             37.49M
```

可以进一步增加比例条。

底层继续保留：

```text
inputTokens
cacheReadTokens
cacheWriteTokens
outputTokens
totalTokens
```

不要把 Cache 在 UI 上过度简化。

------

## 7. Performance

建议独立展示：

```text
Performance
────────────────────────

Average Latency      9.2s
P95 Latency         28.4s
Tokens / Request   304.8K
Success Rate        100.0%
```

未来可以扩展：

```text
TTFT
P99
Error Rate
```

但当前不必一次全部加入。

------

## 8. 时间范围

建议：

```text
[今天] [7 天] [30 天] [自定义]
```

右侧：

```text
↻ 自动刷新
Updated 18:26
```

原则：

-   时间范围是全局控制。
-   自动刷新属于辅助操作。
-   最后更新时间提供数据新鲜度反馈。

------

## 9. Token Trend

当前趋势可以升级为时间序列图：

```text
Token Trend

40M ┤                  ╭────
30M ┤             ╭────╯
20M ┤        ╭────╯
10M ┤   ╭────╯
 0M ┼───┴────────────────────
      08/10  08/11  08/12 ...
```

顶部可以增加：

```text
[Tokens] [Requests] [Latency]
```

第一阶段至少支持：

-   Tokens
-   Requests

------

## 10. Provider / Model

不建议过度依赖普通表格，也不建议使用饼图作为主要表达。

推荐横向 Bar：

```text
Provider

deepseek-official
████████████████████████████ 100%
123 requests · 37.49M tokens

openai
██████ 12%
...
```

Model 同理：

```text
deepseek-v4-flash
deepseek-official

123 requests · 37.49M tokens
████████████████████████
```

优势：

-   适合 Top N。
-   易比较绝对量。
-   信息密度高。

------

## 11. Session Ranking

建议：

```text
Top Sessions

01  session-...d05aa
    86 requests
    34.92M tokens
    ████████████████████

02  3af2db...d6d332
    36 requests
    2.56M tokens
    ██
```

可继续显示：

```text
Tokens / Request
```

帮助识别异常大的 Session。

------

## 12. Recent Requests

不要让所有字段拥有相同视觉权重。

推荐：

```text
08:30  deepseek-v4-flash
       deepseek-official

       469.9K tokens
       7.3s
                           ● Success
```

重点信息：

-   Model
-   Provider
-   Total Tokens
-   Latency
-   Status

身份信息与指标信息使用不同字体层级。

------

## 13. Status Badge

不要只显示：

```text
成功
失败
中断
```

推荐：

```text
● Success
● Error
● Aborted
● Max Tokens
```

使用 Harness 的语义色变量，保持低饱和、低侵入：

```text
Success      subtle green
Error        subtle red
Aborted      subtle yellow
Max Tokens   subtle orange
```

------

## 14. Request History

当前已经具备：

-   Filter
-   Search
-   Sort
-   Pagination
-   Provider
-   Model
-   Status

下一阶段重点是提升信息密度与可读性：

```text
┌─────────────────────────────────────────────┐
│ 最近请求                         123 requests│
├─────────────────────────────────────────────┤
│ [7天] [30天] [全部]                         │
│ [Provider] [Model] [Status] [Search...]     │
├─────────────────────────────────────────────┤
│ 08:30  deepseek-v4-flash    469.9K   7.3s   │
│        deepseek-official                     │
│        ● Success                             │
├─────────────────────────────────────────────┤
│ 08:30  deepseek-v4-flash    469.1K   5.8s   │
│        deepseek-official                     │
│        ● Success                             │
└─────────────────────────────────────────────┘
```

不要让所有列使用同一级字体权重。

------

## 15. Request Detail Drawer

这是 Request History 最值得增加的交互。

点击某条 Request 后，在右侧打开 Detail：

```text
┌──────────────────────────────┐
│ Request Detail            ×  │
├──────────────────────────────┤
│ Provider                     │
│ deepseek-official            │
│                              │
│ Model                        │
│ deepseek-v4-flash            │
│                              │
│ Token Usage                  │
│ Input              351       │
│ Cache Read       469.0K      │
│ Cache Write          —       │
│ Output              527      │
│ Total             469.9K     │
│                              │
│ Latency             7.3s     │
│ Status              Success  │
│                              │
│ Session                      │
│ session-...d05aa             │
└──────────────────────────────┘
```

未来可增加：

```text
Error Message
Started At
Ended At
Duration
Request ID
Sequence
```

这会显著增强 Observability 属性。

------

## 16. Empty State

所有主要区域统一使用 Empty State：

```text
当前时间范围暂无数据
```

推荐统一组件：

```text
EmptyState
├── icon
├── title
└── description
```

不要只显示：

```text
0
—
空白
```

------

## 17. Loading

建议使用区域级 Skeleton：

```text
KPI Skeleton
Chart Skeleton
Table Skeleton
```

避免大范围单一：

```text
Loading...
```

------

## 18. Design System

建议建立轻量 UI 基础组件：

```text
client/
├── ui/
│   ├── tokens.ts
│   ├── Card.tsx
│   ├── StatCard.tsx
│   ├── Badge.tsx
│   ├── Section.tsx
│   ├── DataTable.tsx
│   ├── EmptyState.tsx
│   └── Skeleton.tsx
│
├── OverviewPanel.tsx
├── RequestHistory.tsx
├── RequestDetailDrawer.tsx
└── UsageOverlay.tsx
```

这样可以避免大量 inline style 分散在页面代码中。

------

## 19. Design Tokens

至少统一：

```text
Spacing
Radius
Typography
Shadow
Transition
Layout
```

示例：

```ts
const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
};
```

实际数值应结合 Harness 现有 UI 规范调整。

------

## 20. Typography

建议明确：

```text
Page Title
Section Title
Card Title
Primary Value
Secondary Value
Label
Caption
```

例如：

```text
Page Title
    20px / semibold

Primary Value
    22~28px / semibold

Section Title
    14~16px / medium

Label
    12px / secondary

Caption
    11~12px / tertiary
```

------

## 21. Card

Card 不要过度强调边框与阴影。

建议：

```text
background
border
subtle shadow
small radius
```

目标是：

>   有区域边界，但不要让页面看起来像很多独立的小窗口。

------

## 22. 不建议

### 22.1 饼图泛滥

Provider / Model 更适合 Bar。

### 22.2 高饱和颜色

继续遵循 Harness Theme。

### 22.3 KPI 无限增加

未来新增 Cost、TTFT 等指标应继续分层，而不是不停增加小卡片。

### 22.4 引入大型 UI 框架

当前没有必要为了 UI 引入明显增加体积和复杂度的依赖。

### 22.5 过度动画

Analytics Dashboard 更需要稳定和快速感。

------

## 23. 后端配合原则

本次 UI 优化原则上属于 Presentation Layer Refactoring，不需要大规模修改后端。

建议长期保持：

```text
Overview    → usage_record / mixed
Trend       → usage_daily_stats
Provider    → usage_daily_stats
Model       → usage_daily_stats
Session     → usage_record
Request     → usage_record
```

也就是说：

>   长期聚合型查询使用 `usage_daily_stats`；需要请求级语义的页面继续使用 `usage_record`。

------

## 24. 实施顺序

推荐拆成三个 Commit。

### Commit 1：Design System

只做：

```text
tokens
Card
StatCard
Badge
Section
Typography
Table
EmptyState
Skeleton
```

目标：

>   不改变业务逻辑，只统一视觉语言。

### Commit 2：Overview Redesign

处理：

```text
Header
KPI
Token Usage
Performance
Trend
Provider
Model
Session
Recent Requests
```

目标：

>   重新定义信息层级。

### Commit 3：Request History Redesign

处理：

```text
Filter
Table
Status Badge
Row Hover
Request Detail Drawer
Pagination
```

目标：

>   提升请求级数据分析能力。

------

## 25. 最终 Dashboard 目标

```text
┌─────────────────────────────────────────────────────────────┐
│ 用量分析                                   概览  请求历史  × │
│ 模型使用情况与性能                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [今天] [7 天] [30 天] [自定义]             ↻ 自动刷新       │
│                                                             │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
│ │ 请求数 │ │总Tokens│ │ 成功率 │ │缓存命中│                │
│ │  123   │ │37.49M  │ │100.0%  │ │ 98.7%  │                │
│ └────────┘ └────────┘ └────────┘ └────────┘                │
│                                                             │
│ ┌──────────────────────────┐ ┌──────────────────────────┐   │
│ │ Token Usage              │ │ Performance              │   │
│ │ Input       478.7K       │ │ Avg        9.2s         │   │
│ │ Cache      36.89M        │ │ P95       28.4s          │   │
│ │ Output      126.5K       │ │ Tokens/Req 304.8K        │   │
│ │ Total      37.49M        │ │                          │   │
│ └──────────────────────────┘ └──────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Token Trend                         Tokens / Requests  │ │
│ │         ╭────╮                                          │ │
│ │    ╭────╯    ╰────╮                                     │ │
│ │ ───╯               ╰───                                 │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────┐ ┌────────────────────────────┐  │
│ │ Provider                │ │ Model                      │  │
│ │ deepseek █████████ 100% │ │ v4-flash █████████ 100%   │  │
│ └─────────────────────────┘ └────────────────────────────┘  │
│                                                             │
│ Recent Requests                                             │
│ ─────────────────────────────────────────────────────────── │
│ 08:30  deepseek-v4-flash    469.9K    7.3s      ● Success  │
│ 08:30  deepseek-v4-flash    469.1K    5.8s      ● Success  │
│ 08:30  deepseek-v4-flash    468.5K    4.1s      ● Success  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

------

## 26. 开发优先级

### P0

```text
1. Design Tokens
2. Overlay Header / Body Layout
3. KPI 层级重构
4. Token Usage / Performance 分区
5. Trend 图表重新设计
```

### P1

```text
6. Provider / Model Bar
7. Recent Requests 重构
8. Status Badge
9. Session Ranking
10. Loading / Empty State
```

### P2

```text
11. Request Detail Drawer
12. Advanced Trend Metric
13. Cost UI
14. 更多交互
```

------

## 27. 最终设计原则

```text
少一点装饰
多一点层级

少一点卡片
多一点信息关系

少一点颜色
多一点语义

少一点复杂导航
多一点上下文

少一点重复数据
多一点分析价值
```

用户进入页面后，应在几秒钟内回答：

```text
我用了多少？
主要用了哪个 Provider / Model？
Token 主要花在哪里？
性能怎么样？
有没有异常？
最近一次请求发生了什么？
```

这就是 `dsh-usage-analytics` UI 2.0 的核心目标。
