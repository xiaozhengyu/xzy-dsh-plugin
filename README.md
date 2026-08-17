# xzy-dsh-plugins

DeepSeek Harness 个人插件集。

## 开发环境

- Node.js ≥ 22.5（推荐 22.x，仓库通过 pnpm 管理，版本见根 `package.json` 的 `packageManager`）。
- 全局安装 DeepSeek Harness CLI（`dsh`，本项目锁定 v0.1.0-rc.6），为 `@deepseek-ai/*` 提供类型与运行环境。
- 各插件 `tsconfig.json` 的 `paths` 会把 `@deepseek-ai/*` 类型指向本机 DSH 安装目录
  （本机为 `D:\npm-global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\*`）。
  该路径是机器相关的：换机器后需同步更新，否则 `pnpm typecheck` 会报找不到模块
  （详见 `packages/dsh-usage-analytics/README.md`「测试」一节）。

## 插件清单

| 插件 | 说明 | 状态 |
|---|---|---|
| [dsh-usage-analytics](packages/dsh-usage-analytics) | DeepSeek Harness 的 LLM Usage Analytics / Observability 插件 | 已完成（采集 / 台账 / 查询 / UI 2.0 / 保留策略） |

## 插件介绍

### dsh-usage-analytics

基于 Harness `session/event` 流采集、归一化每一次 LLM 调用的 usage / cache / latency / status，
建立面向历史分析的 Usage Ledger（SQLite），并通过侧栏入口提供全屏用量分析界面。

核心能力：

- 采集：`session/event` 全局火线 → 归一化 → 幂等入账（provisional → final 替换，fail-open）。
- 存储：SQLite（STRICT + WAL + 参数化 SQL），异步批量写入；请求明细 60 天 / 日聚合 360 天 / raw 7 天。
- 查询：Overview / Trend / Provider / Model / Session / Request History（筛选、搜索、排序、分页）。
- UI 2.0：侧栏「用量」按钮 → `shell.overlay` 全屏弹窗；概览（KPI 分层、Token 用量、
  SVG 趋势、Provider/Model Bar、会话排行、最近请求）+ 请求历史 + 请求详情抽屉。

npm 包名：`@xiaozhengyu/dsh-usage-analytics`（发布与安装见插件目录内 README）。

文档：

- 架构设计：`doc/DSH-Usage-Analytics-Architecture.md`
- API Lock（基于 DSH v0.1.0-rc.6 实际源码）：`doc/harness-api.md`
- 数据保留策略与存储架构：`doc/DSH-Usage-Analytics-数据保留策略与存储架构建议.md`
- UI 2.0 方案：`doc/DSH-Usage-Analytics UI 2.0.md`

安装与配置见插件目录内 README。
