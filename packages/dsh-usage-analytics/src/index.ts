/**
 * dsh-usage-analytics — DeepSeek Harness LLM Usage Analytics plugin.
 *
 * Phase 1 (current): collector that turns the `session/event` stream into
 * normalized, finalized `UsageRecord`s. No persistence yet (Phase 2: SQLite
 * Usage Ledger). API surface locked against DSH v0.1.0-rc.6 — see
 * doc/harness-api.md.
 */

// Plugin entry (Cordis function-form plugin, loaded via a profile patch row).
export { apply, name } from './plugin/UsageAnalyticsPlugin.js';
export type { UsageAnalyticsPluginConfig } from './plugin/UsageAnalyticsPlugin.js';

// Collector units (reusable/testable outside DSH).
export { UsageCollector } from './collector/UsageCollector.js';
export type { UsageCollectorOptions, UsageCollectorLogger, IngestContext } from './collector/UsageCollector.js';
export { RequestTracker } from './collector/RequestTracker.js';
export type { RequestTrackerOptions } from './collector/RequestTracker.js';
export { normalizeEvent } from './collector/EventNormalizer.js';
export type { NormalizedEvent } from './collector/EventNormalizer.js';

// Model vocabulary.
export type { UsageRecord, RequestErrorInfo } from './model/UsageRecord.js';
export type {
  AssistantMessageLike,
  FinishReasonLike,
  LlmFailureLike,
  ModelMessageSourceLike,
  RequestStatus,
  StreamChunkLike,
  TokenUsageLike,
  TurnEndReasonLike,
  UsageBuckets,
  UsageSource,
} from './model/types.js';
export { tokenUsageToBuckets } from './model/types.js';
