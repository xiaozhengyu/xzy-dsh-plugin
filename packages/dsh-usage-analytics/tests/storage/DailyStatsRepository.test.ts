import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  DailyStatsRepository,
  localDayNumber,
  localDayStart,
} from '../../src/storage/DailyStatsRepository.js';
import { runMigrations } from '../../src/storage/Migration.js';
import { UsageRepository } from '../../src/storage/UsageRepository.js';
import { makeRecord } from '../helpers.js';

function env(): { db: DatabaseSync; repository: UsageRepository; stats: DailyStatsRepository } {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return { db, repository: new UsageRepository(db), stats: new DailyStatsRepository(db) };
}

const DAY_A = localDayStart(20260816); // 本地时区 2026-08-16 00:00
const DAY_B = localDayStart(20260817);

describe('DailyStatsRepository', () => {
  it('aggregates by local day / provider / model and is idempotent', () => {
    const { db, repository, stats } = env();
    try {
      repository.insertRecord(
        makeRecord({ seq: 1, startedAt: DAY_A + 3_600_000, completedAt: DAY_A + 3_601_000, durationMs: 1000, status: 'SUCCESS' }),
      );
      repository.insertRecord(
        makeRecord({ seq: 2, turn: 1, step: 1, startedAt: DAY_A + 7_200_000, completedAt: DAY_A + 7_204_000, durationMs: 4000, status: 'ERROR' }),
      );
      repository.insertRecord(
        makeRecord({ seq: 3, turn: 1, step: 2, startedAt: DAY_B + 3_600_000, completedAt: DAY_B + 3_600_500, durationMs: 500, status: 'SUCCESS' }),
      );
      expect(stats.recompute()).toBeGreaterThan(0);
      // 幂等：重复重算不改变计数。
      stats.recompute();
      // 重复插入（INSERT OR IGNORE）不会重复计入。
      repository.insertRecord(makeRecord({ seq: 1, startedAt: DAY_A + 3_600_000, durationMs: 9999 }));
      stats.recompute();

      const trend = stats.trend({ from: DAY_A, to: localDayStart(20260818) });
      expect(trend).toHaveLength(2);
      expect(trend[0]).toMatchObject({
        bucketStart: DAY_A,
        requestCount: 2,
        successCount: 1,
        errorCount: 1,
        totalTokens: 34,
        avgDurationMs: 2500,
      });
      expect(trend[1]).toMatchObject({ bucketStart: DAY_B, requestCount: 1, successCount: 1, totalTokens: 17 });
      expect(localDayNumber(DAY_A)).toBe(20260816);
    } finally {
      db.close();
    }
  });

  it('fills missing days with zeroes in a continuous series', () => {
    const { db, repository, stats } = env();
    try {
      repository.insertRecord(makeRecord({ seq: 1, startedAt: DAY_A + 3_600_000 }));
      stats.recompute();
      const trend = stats.trend({ from: localDayStart(20260814), to: localDayStart(20260817) });
      expect(trend.map((b) => b.bucketStart)).toEqual([
        localDayStart(20260814),
        localDayStart(20260815),
        DAY_A,
      ]);
      expect(trend[0]).toMatchObject({ requestCount: 0, totalTokens: 0, avgDurationMs: null });
    } finally {
      db.close();
    }
  });

  it('deleteBefore removes only older local days', () => {
    const { db, repository, stats } = env();
    try {
      repository.insertRecord(makeRecord({ seq: 1, startedAt: DAY_A + 3_600_000 }));
      repository.insertRecord(makeRecord({ seq: 2, turn: 1, step: 1, startedAt: DAY_B + 3_600_000 }));
      stats.recompute();
      expect(stats.count()).toBe(2);
      expect(stats.deleteBefore(20260817)).toBe(1);
      expect(stats.count()).toBe(1);
      expect(stats.trend({ from: DAY_B, to: localDayStart(20260818) })[0]).toMatchObject({ requestCount: 1 });
    } finally {
      db.close();
    }
  });
});
