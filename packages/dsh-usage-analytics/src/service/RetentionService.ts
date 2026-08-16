import type { DatabaseSync } from 'node:sqlite';
import { localDayNumber } from '../storage/DailyStatsRepository.js';

/** Retention window: number of days, or 'forever' to keep everything. */
export type RetentionDays = number | 'forever';

export interface RetentionConfig {
  /** Keep usage_record rows within this many days. Default 60. */
  usageRecordsDays?: RetentionDays;
  /** Keep usage_raw_event rows within this many days. Default 7. */
  rawEventsDays?: RetentionDays;
  /** Keep usage_daily_stats rows within this many days. Default 360. */
  statsDays?: RetentionDays;
}

export interface RetentionResult {
  usageRecordsDeleted: number;
  rawEventsDeleted: number;
  statsRowsDeleted: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Periodic cleanup of derived ledger rows (architecture doc §23): request detail
 * 60d, daily stats 360d, raw events 7d by default — raw payloads can be large
 * and are short-lived.
 */
export class RetentionService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly config: RetentionConfig = {},
  ) {}

  run(now: number = Date.now()): RetentionResult {
    const usageCutoff = cutoff(now, this.config.usageRecordsDays ?? 60);
    const rawCutoff = cutoff(now, this.config.rawEventsDays ?? 7);
    const statsCutoffDay =
      this.config.statsDays === 'forever' ? null : localDayNumber(now - (this.config.statsDays ?? 360) * DAY_MS);
    return {
      usageRecordsDeleted:
        usageCutoff === null
          ? 0
          : Number(this.db.prepare('DELETE FROM usage_record WHERE completed_at < ?').run(usageCutoff).changes),
      rawEventsDeleted:
        rawCutoff === null
          ? 0
          : Number(this.db.prepare('DELETE FROM usage_raw_event WHERE event_time < ?').run(rawCutoff).changes),
      statsRowsDeleted:
        statsCutoffDay === null
          ? 0
          : Number(this.db.prepare('DELETE FROM usage_daily_stats WHERE day < ?').run(statsCutoffDay).changes),
    };
  }
}

/** Cutoff epoch ms for a retention window; null when 'forever'. */
export function retentionCutoff(now: number, days: RetentionDays): number | null {
  if (days === 'forever') return null;
  return now - days * DAY_MS;
}

function cutoff(now: number, days: RetentionDays): number | null {
  return retentionCutoff(now, days);
}
