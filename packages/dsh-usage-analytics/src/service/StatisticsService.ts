import type {
  Granularity,
  ModelStats,
  OverviewMetrics,
  ProviderStats,
  SessionStats,
  TimeRange,
  TrendBucket,
} from '../query/types.js';
import type { UsageRecordRow } from '../storage/UsageRepository.js';

/** Per-row scalar cost callback (from CostService); undefined rows are uncounted. */
export type RowCost = (row: UsageRecordRow) => number | undefined;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/** Pick a sensible default granularity for a range (architecture doc §3.2). */
export function autoGranularity(range: TimeRange): Granularity {
  const span = range.to - range.from;
  if (span <= DAY_MS) return 'hour';
  if (span <= 30 * DAY_MS) return 'day';
  if (span <= 90 * DAY_MS) return 'week';
  return 'month';
}

/** Nearest-rank percentile over values; null when empty. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

function countStatus(rows: readonly UsageRecordRow[], status: string): number {
  let count = 0;
  for (const row of rows) if (row.status === status) count += 1;
  return count;
}

function rate(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

function sumCost(rows: readonly UsageRecordRow[], costFor?: RowCost): number | undefined {
  if (!costFor) return undefined;
  let cost = 0;
  for (const row of rows) {
    const c = costFor(row);
    if (c !== undefined) cost += c;
  }
  return cost;
}

function emptyTrendBucket(bucketStart: number): TrendBucket {
  return {
    bucketStart,
    requestCount: 0,
    successCount: 0,
    errorCount: 0,
    totalTokens: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    avgDurationMs: null,
  };
}

/**
 * Pure aggregation mathematics over usage_record rows. No I/O: every function
 * takes rows (and optionally a per-row cost callback) and returns plain
 * metrics, so the whole service is unit-testable without a database.
 */
export const StatisticsService = {
  overview(rows: readonly UsageRecordRow[], range: TimeRange, costFor?: RowCost): OverviewMetrics {
    const requestCount = rows.length;
    const successCount = countStatus(rows, 'SUCCESS');
    const errorCount = countStatus(rows, 'ERROR');
    const abortedCount = countStatus(rows, 'ABORTED');
    const maxTokensCount = countStatus(rows, 'MAX_TOKENS');
    const unknownCount = countStatus(rows, 'UNKNOWN');

    const inputTokens = sum(rows.map((r) => r.inputTokens ?? 0));
    const cacheReadTokens = sum(rows.map((r) => r.cacheReadTokens ?? 0));
    const cacheWriteTokens = sum(rows.map((r) => r.cacheWriteTokens ?? 0));
    const outputTokens = sum(rows.map((r) => r.outputTokens ?? 0));
    const totalTokens = sum(rows.map((r) => r.totalTokens ?? 0));
    const cachedInputTokens = cacheReadTokens + cacheWriteTokens;

    const durations = rows.map((r) => r.durationMs);
    const totalDurationMs = sum(durations);
    const estimatedCost = sumCost(rows, costFor);

    return {
      range,
      requestCount,
      successCount,
      errorCount,
      abortedCount,
      maxTokensCount,
      unknownCount,
      successRate: rate(successCount, requestCount),
      errorRate: rate(errorCount, requestCount),
      totalTokens,
      inputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      outputTokens,
      cachedInputTokens,
      cacheHitRate: rate(cacheReadTokens, inputTokens + cacheReadTokens + cacheWriteTokens),
      avgDurationMs: requestCount > 0 ? totalDurationMs / requestCount : null,
      p50DurationMs: percentile(durations, 50),
      p95DurationMs: percentile(durations, 95),
      p99DurationMs: percentile(durations, 99),
      maxDurationMs: durations.length > 0 ? Math.max(...durations) : null,
      ...(estimatedCost === undefined ? {} : { estimatedCost }),
      tokensPerRequest: rate(totalTokens, requestCount),
      outputTokensPerRequest: rate(outputTokens, requestCount),
      outputTokensPerSecond: totalDurationMs > 0 ? outputTokens / (totalDurationMs / 1000) : null,
    };
  },

  /** Continuous trend series: empty buckets are filled with zeroes. */
  trend(
    rows: readonly UsageRecordRow[],
    range: TimeRange,
    granularity: Granularity,
    costFor?: RowCost,
  ): TrendBucket[] {
    const starts = bucketStarts(range, granularity);
    const firstIndex = bucketIndex(starts[0]!, granularity);
    const lastIndex = bucketIndex(starts[starts.length - 1]!, granularity);
    const byIndex = new Map<number, TrendBucket>();
    const durations = new Map<number, { sum: number; count: number }>();
    for (const row of rows) {
      const idx = bucketIndex(row.startedAt, granularity);
      if (idx < firstIndex || idx > lastIndex) continue;
      let bucket = byIndex.get(idx);
      if (!bucket) {
        bucket = emptyTrendBucket(bucketStartOf(idx, granularity));
        byIndex.set(idx, bucket);
      }
      bucket.requestCount += 1;
      if (row.status === 'SUCCESS') bucket.successCount += 1;
      if (row.status === 'ERROR') bucket.errorCount += 1;
      bucket.totalTokens += row.totalTokens ?? 0;
      bucket.inputTokens += row.inputTokens ?? 0;
      bucket.cacheReadTokens += row.cacheReadTokens ?? 0;
      bucket.cacheWriteTokens += row.cacheWriteTokens ?? 0;
      bucket.outputTokens += row.outputTokens ?? 0;
      if (costFor) {
        const c = costFor(row);
        if (c !== undefined) bucket.estimatedCost = (bucket.estimatedCost ?? 0) + c;
      }
      const d = durations.get(idx) ?? { sum: 0, count: 0 };
      d.sum += row.durationMs;
      d.count += 1;
      durations.set(idx, d);
    }
    return starts.map((start) => {
      const idx = bucketIndex(start, granularity);
      const bucket = byIndex.get(idx);
      if (!bucket) return emptyTrendBucket(start);
      bucket.bucketStart = start;
      const d = durations.get(idx);
      bucket.avgDurationMs = d && d.count > 0 ? d.sum / d.count : null;
      return bucket;
    });
  },

  providerStats(rows: readonly UsageRecordRow[], costFor?: RowCost): ProviderStats[] {
    const groups = groupBy(rows, (r) => r.provider ?? '(unknown)');
    return [...groups.entries()]
      .map(([provider, group]) => this.providerStat(provider, group, costFor))
      .sort((a, b) => b.totalTokens - a.totalTokens);
  },

  modelStats(rows: readonly UsageRecordRow[], costFor?: RowCost): ModelStats[] {
    const groups = groupBy(rows, (r) => `${r.provider ?? '(unknown)'}\u0000${r.model ?? '(unknown)'}`);
    return [...groups.entries()]
      .map(([key, group]) => {
        const [provider, model] = key.split('\u0000');
        return { ...this.providerStat(provider!, group, costFor), model: model! };
      })
      .sort((a, b) => b.totalTokens - a.totalTokens);
  },

  /** Per-session aggregates (computed view; design §8.3 — materialized table deferred). */
  sessionStats(rows: readonly UsageRecordRow[], costFor?: RowCost): SessionStats[] {
    const groups = groupBy(rows, (r) => r.sessionId);
    return [...groups.entries()]
      .map(([sessionId, group]) => {
        const requestCount = group.length;
        const successCount = countStatus(group, 'SUCCESS');
        const errorCount = countStatus(group, 'ERROR');
        const inputTokens = sum(group.map((r) => r.inputTokens ?? 0));
        const cacheReadTokens = sum(group.map((r) => r.cacheReadTokens ?? 0));
        const cacheWriteTokens = sum(group.map((r) => r.cacheWriteTokens ?? 0));
        const outputTokens = sum(group.map((r) => r.outputTokens ?? 0));
        const startedAt = Math.min(...group.map((r) => r.startedAt));
        const endedAt = Math.max(...group.map((r) => r.completedAt));
        const estimatedCost = sumCost(group, costFor);
        return {
          sessionId,
          requestCount,
          successCount,
          errorCount,
          successRate: rate(successCount, requestCount),
          startedAt,
          endedAt,
          durationMs: Math.max(0, endedAt - startedAt),
          totalTokens: sum(group.map((r) => r.totalTokens ?? 0)),
          inputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          outputTokens,
          cacheHitRate: rate(cacheReadTokens, inputTokens + cacheReadTokens + cacheWriteTokens),
          avgDurationMs: requestCount > 0 ? sum(group.map((r) => r.durationMs)) / requestCount : null,
          ...(estimatedCost === undefined ? {} : { estimatedCost }),
        };
      })
      .sort((a, b) => b.totalTokens - a.totalTokens);
  },

  providerStat(provider: string, rows: readonly UsageRecordRow[], costFor?: RowCost): ProviderStats {
    const requestCount = rows.length;
    const successCount = countStatus(rows, 'SUCCESS');
    const errorCount = countStatus(rows, 'ERROR');
    const durations = rows.map((r) => r.durationMs);
    const estimatedCost = sumCost(rows, costFor);
    return {
      provider,
      requestCount,
      successCount,
      errorCount,
      successRate: rate(successCount, requestCount),
      totalTokens: sum(rows.map((r) => r.totalTokens ?? 0)),
      inputTokens: sum(rows.map((r) => r.inputTokens ?? 0)),
      cacheReadTokens: sum(rows.map((r) => r.cacheReadTokens ?? 0)),
      cacheWriteTokens: sum(rows.map((r) => r.cacheWriteTokens ?? 0)),
      outputTokens: sum(rows.map((r) => r.outputTokens ?? 0)),
      avgDurationMs: requestCount > 0 ? sum(durations) / requestCount : null,
      p95DurationMs: percentile(durations, 95),
      ...(estimatedCost === undefined ? {} : { estimatedCost }),
    };
  },
};

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/** Bucket index of a time under a granularity (calendar-month aware; others are floor-aligned). */
function bucketIndex(time: number, granularity: Granularity): number {
  switch (granularity) {
    case 'hour':
      return Math.floor(time / HOUR_MS);
    case 'day':
      return Math.floor(time / DAY_MS);
    case 'week':
      return Math.floor(time / WEEK_MS);
    case 'month':
      return monthIndex(time);
  }
}

function bucketStartOf(index: number, granularity: Granularity): number {
  switch (granularity) {
    case 'hour':
      return index * HOUR_MS;
    case 'day':
      return index * DAY_MS;
    case 'week':
      return index * WEEK_MS;
    case 'month':
      return monthStart(index);
  }
}

function monthIndex(time: number): number {
  const d = new Date(time);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function monthStart(index: number): number {
  const year = Math.floor(index / 12);
  const month = index % 12;
  return Date.UTC(year, month, 1);
}

function bucketStarts(range: TimeRange, granularity: Granularity): number[] {
  // `to` is exclusive (matches scan's `started_at < to`), so the last bucket is
  // the one containing `to - 1ms`.
  const first = bucketIndex(range.from, granularity);
  const last = bucketIndex(Math.max(range.from, range.to - 1), granularity);
  const starts: number[] = [];
  for (let index = first; index <= last; index += 1) starts.push(bucketStartOf(index, granularity));
  return starts;
}
