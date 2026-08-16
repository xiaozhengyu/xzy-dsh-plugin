import type { RequestStatus } from '../model/types.js';

/**
 * Query vocabulary for the Phase 3 Usage Service (architecture doc §13).
 * All times are Unix epoch milliseconds.
 */

/** Inclusive time window over request start times: [from, to]. */
export interface TimeRange {
  from: number;
  to: number;
}

/** Trend bucketing granularity. */
export type Granularity = 'hour' | 'day' | 'week' | 'month';

export interface RequestFilters {
  from?: number;
  to?: number;
  provider?: string;
  model?: string;
  status?: RequestStatus;
  sessionId?: string;
  /** Substring match over sessionId / provider / model / error message. */
  search?: string;
}

export type RequestSortField = 'time' | 'duration' | 'totalTokens';
export type SortOrder = 'asc' | 'desc';

export interface RequestQuery extends RequestFilters {
  sortBy?: RequestSortField;
  order?: SortOrder;
  offset?: number;
  limit?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

/** Overview card metrics (architecture doc §12, §3.1). */
export interface OverviewMetrics {
  range: TimeRange;
  requestCount: number;
  successCount: number;
  errorCount: number;
  abortedCount: number;
  maxTokensCount: number;
  unknownCount: number;
  /** success / requests; null when no requests. */
  successRate: number | null;
  errorRate: number | null;
  totalTokens: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  /** cacheRead + cacheWrite (billed-input cache portion). */
  cachedInputTokens: number;
  /** cacheRead / (input + cacheRead + cacheWrite); null when no prompt tokens. */
  cacheHitRate: number | null;
  avgDurationMs: number | null;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  p99DurationMs: number | null;
  maxDurationMs: number | null;
  tokensPerRequest: number | null;
  outputTokensPerRequest: number | null;
  /** outputTokens / wall seconds (sum of durations); null when no duration. */
  outputTokensPerSecond: number | null;
}

/** One trend bucket (architecture doc §3.2). */
export interface TrendBucket {
  /** Bucket start, epoch ms. */
  bucketStart: number;
  requestCount: number;
  successCount: number;
  errorCount: number;
  totalTokens: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  avgDurationMs: number | null;
}

/** Per-provider aggregates (architecture doc §3.3). */
export interface ProviderStats {
  provider: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  successRate: number | null;
  totalTokens: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
}

/** Per-provider+model aggregates (architecture doc §3.4). */
export interface ModelStats extends ProviderStats {
  model: string;
}

/** Per-session aggregates (computed view over usage_record; design §8.3). */
export interface SessionStats {
  sessionId: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  successRate: number | null;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  totalTokens: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  cacheHitRate: number | null;
  avgDurationMs: number | null;
}

export interface SessionDetail {
  session: SessionStats;
  requests: Array<{
    id: number;
    turn: number;
    step: number;
    seq: number | null;
    startedAt: number;
    completedAt: number;
    durationMs: number;
    provider: string | null;
    model: string | null;
    status: string;
    finishReason: string | null;
    usageSource: string;
    totalTokens: number | null;
  }>;
}
