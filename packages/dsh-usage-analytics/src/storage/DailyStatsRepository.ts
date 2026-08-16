import type { DatabaseSync } from 'node:sqlite';
import type { TimeRange, TrendBucket } from '../query/types.js';

const DAY_MS = 24 * 3_600_000;

/** 本地时区自然日键：YYYYMMDD。聚合（strftime 'localtime'）与查询共用同一约定。 */
export function localDayNumber(ms: number): number {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** 本地时区自然日的起始时刻（epoch ms）。 */
export function localDayStart(day: number): number {
  const year = Math.floor(day / 10000);
  const month = Math.floor(day / 100) % 100;
  const date = day % 100;
  return new Date(year, month - 1, date).getTime();
}

export interface DailyStatsRow {
  day: number;
  provider: string;
  model: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalDurationMs: number;
}

/**
 * 日粒度聚合表（usage_daily_stats）的读写面。
 *
 * `recompute()` 对 usage_record 全量 GROUP BY（按本地自然日 / provider / model）UPSERT，
 * 天然幂等：replay 由 (session_id, seq) 的 INSERT OR IGNORE 保证不重复，重算只是对齐事实；
 * 已超出明细保留期、被 retention 删除的历史日不在 GROUP BY 结果里，不会被触碰。
 */
export class DailyStatsRepository {
  constructor(private readonly db: DatabaseSync) {}

  /** 幂等重算；返回受影响行数（插入 + 更新）。 */
  recompute(now: number = Date.now()): number {
    const result = this.db
      .prepare(
        `INSERT INTO usage_daily_stats (
          day, provider, model,
          request_count, success_count, error_count,
          input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, total_tokens,
          total_duration_ms, created_at, updated_at
        )
        SELECT
          CAST(strftime('%Y%m%d', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS day,
          COALESCE(provider, '(unknown)') AS provider,
          COALESCE(model, '(unknown)') AS model,
          COUNT(*) AS request_count,
          SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END) AS error_count,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
          COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COALESCE(SUM(duration_ms), 0) AS total_duration_ms,
          ? AS created_at,
          ? AS updated_at
        FROM usage_record
        GROUP BY day, provider, model
        ON CONFLICT(day, provider, model) DO UPDATE SET
          request_count = excluded.request_count,
          success_count = excluded.success_count,
          error_count = excluded.error_count,
          input_tokens = excluded.input_tokens,
          cache_read_tokens = excluded.cache_read_tokens,
          cache_write_tokens = excluded.cache_write_tokens,
          output_tokens = excluded.output_tokens,
          total_tokens = excluded.total_tokens,
          total_duration_ms = excluded.total_duration_ms,
          updated_at = excluded.updated_at`,
      )
      .run(now, now);
    return Number(result.changes);
  }

  /** 删除本地日键早于截止日的统计行；返回删除行数。 */
  deleteBefore(cutoffDay: number): number {
    return Number(this.db.prepare('DELETE FROM usage_daily_stats WHERE day < ?').run(cutoffDay).changes);
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS c FROM usage_daily_stats').get() as { c: number }).c;
  }

  /** 日粒度连续趋势（本地时区日桶；缺失日补零；[from, to) 排他）。 */
  trend(range: TimeRange): TrendBucket[] {
    const dayFrom = localDayNumber(range.from);
    const dayTo = localDayNumber(Math.max(range.from, range.to - 1));
    const rows = this.db
      .prepare('SELECT * FROM usage_daily_stats WHERE day BETWEEN ? AND ? ORDER BY day')
      .all(dayFrom, dayTo) as Array<Record<string, unknown>>;
    const byDay = new Map<number, TrendBucket>();
    for (const row of rows) {
      const day = row.day as number;
      const requestCount = row.request_count as number;
      byDay.set(day, {
        bucketStart: localDayStart(day),
        requestCount,
        successCount: row.success_count as number,
        errorCount: row.error_count as number,
        totalTokens: row.total_tokens as number,
        inputTokens: row.input_tokens as number,
        cacheReadTokens: row.cache_read_tokens as number,
        cacheWriteTokens: row.cache_write_tokens as number,
        outputTokens: row.output_tokens as number,
        avgDurationMs: requestCount > 0 ? (row.total_duration_ms as number) / requestCount : null,
      });
    }
    const buckets: TrendBucket[] = [];
    let day = dayFrom;
    while (day <= dayTo) {
      const start = localDayStart(day);
      buckets.push(
        byDay.get(day) ?? {
          bucketStart: start,
          requestCount: 0,
          successCount: 0,
          errorCount: 0,
          totalTokens: 0,
          inputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
          avgDurationMs: null,
        },
      );
      day = localDayNumber(new Date(start + DAY_MS).getTime());
    }
    return buckets;
  }
}
