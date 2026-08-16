import type {
  ModelStats,
  OverviewMetrics,
  Paginated,
  ProviderStats,
  RequestQuery,
  SessionDetail,
  SessionStats,
  TimeRange,
  TrendBucket,
} from '../query/types.js';
import { autoGranularity, StatisticsService } from './StatisticsService.js';
import type { DailyStatsRepository } from '../storage/DailyStatsRepository.js';
import type { UsageRecordRow } from '../storage/UsageRepository.js';
import type { UsageRepository } from '../storage/UsageRepository.js';

/**
 * Phase 3 query facade (architecture doc §13). The service never exposes the
 * database directly: callers get typed metrics/rows. Reads are computed on
 * demand from the usage_record ledger; usage_session stays a computed view
 * (design §8.3 materialization deferred until performance requires).
 */
export class UsageService {
  constructor(
    private readonly repository: UsageRepository,
    private readonly stats?: DailyStatsRepository,
  ) {}

  /** Dashboard overview cards for a time range (design §3.1/§12). */
  getOverview(range: TimeRange): OverviewMetrics {
    const rows = this.repository.scan(range.from, range.to);
    return StatisticsService.overview(rows, range);
  }

  /**
   * Token/request/duration trend with auto or explicit granularity (design §3.2).
   * Day granularity reads the usage_daily_stats aggregate (local-timezone day
   * buckets, 360-day window); other granularities compute from usage_record.
   */
  getTrend(range: TimeRange, granularity = autoGranularity(range)): TrendBucket[] {
    if (granularity === 'day' && this.stats) return this.stats.trend(range);
    const rows = this.repository.scan(range.from, range.to);
    return StatisticsService.trend(rows, range, granularity);
  }

  /** Per-provider aggregates (design §3.3). */
  getProviderStats(range: TimeRange): ProviderStats[] {
    const rows = this.repository.scan(range.from, range.to);
    return StatisticsService.providerStats(rows);
  }

  /** Per-provider+model aggregates (design §3.4). */
  getModelStats(range: TimeRange): ModelStats[] {
    const rows = this.repository.scan(range.from, range.to);
    return StatisticsService.modelStats(rows);
  }

  /** Paginated, filtered, sortable request history (design §3.5). */
  listRequests(query: RequestQuery = {}): Paginated<UsageRecordRow> {
    const { rows, total } = this.repository.queryRequests(query);
    return { items: rows, total, offset: query.offset ?? 0, limit: query.limit ?? 50 };
  }

  /** One request by ledger row id. */
  getRequest(id: number): UsageRecordRow | undefined {
    return this.repository.getById(id);
  }

  /** Per-session aggregates (design §3.6). */
  listSessions(range: TimeRange): SessionStats[] {
    const rows = this.repository.scan(range.from, range.to);
    return StatisticsService.sessionStats(rows);
  }

  /** Session detail: aggregate + its request list. */
  getSession(sessionId: string): SessionDetail | undefined {
    const rows = this.repository.listBySession(sessionId);
    if (rows.length === 0) return undefined;
    const stats = StatisticsService.sessionStats(rows).find((s) => s.sessionId === sessionId);
    if (!stats) return undefined;
    return {
      session: stats,
      requests: rows
        .sort((a, b) => a.startedAt - b.startedAt)
        .map((row) => ({
          id: row.id,
          turn: row.turn,
          step: row.step,
          seq: row.seq,
          startedAt: row.startedAt,
          completedAt: row.completedAt,
          durationMs: row.durationMs,
          provider: row.provider,
          model: row.model,
          status: row.status,
          finishReason: row.finishReason,
          usageSource: row.usageSource,
          totalTokens: row.totalTokens,
        })),
    };
  }
}
