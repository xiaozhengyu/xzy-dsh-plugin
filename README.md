## 插件清单

| 插件 | 说明 | 状态 |
|---|---|---|
| [dsh-usage-analytics](packages/dsh-usage-analytics) | DeepSeek Harness 的 LLM Usage Analytics / Observability 插件 | Phase 4（Native UI 完成，web 已接入） |

## 插件介绍

### dsh-usage-analytics

基于 Harness `session/event` 流采集、归一化每一次 LLM 调用的 usage / cache / latency / status，
最终建立面向历史分析的 Usage Ledger（SQLite）。

设计文档：`doc/DSH-Usage-Analytics-Architecture.md`
API Lock（基于 DSH v0.1.0-rc.6 实际源码）：`doc/harness-api.md`
