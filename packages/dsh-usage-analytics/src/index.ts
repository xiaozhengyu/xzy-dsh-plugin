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

// Storage (Phase 2: Usage Ledger).
export { UsageLedger } from './storage/UsageLedger.js';
export type { UsageLedgerConfig } from './storage/UsageLedger.js';
export { openDatabase, USAGE_ANALYTICS_APPLICATION_ID } from './storage/Database.js';
export type { DatabaseOptions, JournalMode } from './storage/Database.js';
export { MIGRATIONS, runMigrations } from './storage/Migration.js';
export type { Migration } from './storage/Migration.js';
export { UsageRepository } from './storage/UsageRepository.js';
export type { RawEventInput, UsageRecordRow } from './storage/UsageRepository.js';
export { DailyStatsRepository, localDayNumber, localDayStart } from './storage/DailyStatsRepository.js';
export type { DailyStatsRow } from './storage/DailyStatsRepository.js';
export { AsyncBatchWriter, defaultTimer } from './storage/AsyncBatchWriter.js';
export type { AsyncBatchWriterOptions, Timer } from './storage/AsyncBatchWriter.js';

// Services.
export { RetentionService, retentionCutoff } from './service/RetentionService.js';
export type { RetentionConfig, RetentionDays, RetentionResult } from './service/RetentionService.js';
export { StatisticsService, autoGranularity, percentile } from './service/StatisticsService.js';
export { UsageService } from './service/UsageService.js';

// Query vocabulary (Phase 3).
export type {
  Granularity,
  ModelStats,
  OverviewMetrics,
  Paginated,
  ProviderStats,
  RequestFilters,
  RequestQuery,
  RequestSortField,
  SessionDetail,
  SessionStats,
  SortOrder,
  TimeRange,
  TrendBucket,
} from './query/types.js';
