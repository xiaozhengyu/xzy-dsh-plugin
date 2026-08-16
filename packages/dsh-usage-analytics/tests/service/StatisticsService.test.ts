import { describe, expect, it } from 'vitest';
import { autoGranularity, percentile, StatisticsService } from '../../src/service/StatisticsService.js';
import { makeRow } from '../helpers.js';

const DAY = 24 * 3_600_000;
const BASE = 1786752000000; // 2026-08-16T00:00:00Z

function row(overrides: Parameters<typeof makeRow>[0] = {}) {
  return makeRow({ startedAt: BASE + 3_600_000, completedAt: BASE + 3_601_000, durationMs: 1000, ...overrides });
}

describe('autoGranularity', () => {
  it('picks hour/day/week/month by span', () => {
    expect(autoGranularity({ from: 0, to: DAY })).toBe('hour');
    expect(autoGranularity({ from: 0, to: 10 * DAY })).toBe('day');
    expect(autoGranularity({ from: 0, to: 60 * DAY })).toBe('week');
    expect(autoGranularity({ from: 0, to: 200 * DAY })).toBe('month');
  });
});

describe('percentile', () => {
  it('computes nearest-rank percentiles', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
    expect(percentile([], 95)).toBeNull();
  });
});

describe('StatisticsService.overview', () => {
  it('computes counts, rates, tokens, latency and efficiency', () => {
    const rows = [
      row({ id: 1, status: 'SUCCESS', durationMs: 1000, inputTokens: 100, cacheReadTokens: 0, outputTokens: 50, totalTokens: 150 }),
      row({ id: 2, status: 'ERROR', durationMs: 2000, inputTokens: 10, outputTokens: 20, totalTokens: 30, errorCode: 'E1', errorMessage: 'boom' }),
      row({ id: 3, status: 'SUCCESS', durationMs: 3000, inputTokens: 200, cacheReadTokens: 100, outputTokens: 30, totalTokens: 330 }),
    ];
    const o = StatisticsService.overview(rows, { from: BASE, to: BASE + DAY });
    expect(o.requestCount).toBe(3);
    expect(o.successCount).toBe(2);
    expect(o.errorCount).toBe(1);
    expect(o.successRate).toBeCloseTo(2 / 3);
    expect(o.errorRate).toBeCloseTo(1 / 3);
    expect(o.totalTokens).toBe(510);
    expect(o.inputTokens).toBe(310);
    expect(o.cacheReadTokens).toBe(100);
    expect(o.outputTokens).toBe(100);
    expect(o.cachedInputTokens).toBe(100);
    expect(o.cacheHitRate).toBeCloseTo(100 / 410); // cacheRead / (input + cacheRead + cacheWrite)
    expect(o.avgDurationMs).toBe(2000);
    expect(o.p50DurationMs).toBe(2000);
    expect(o.p95DurationMs).toBe(3000);
    expect(o.maxDurationMs).toBe(3000);
    expect(o.tokensPerRequest).toBeCloseTo(170);
    expect(o.outputTokensPerRequest).toBeCloseTo(100 / 3);
    expect(o.outputTokensPerSecond).toBeCloseTo(100 / 6);
  });

  it('returns nulls for an empty range', () => {
    const o = StatisticsService.overview([], { from: 0, to: 1 });
    expect(o.requestCount).toBe(0);
    expect(o.successRate).toBeNull();
    expect(o.avgDurationMs).toBeNull();
    expect(o.p95DurationMs).toBeNull();
    expect(o.cacheHitRate).toBeNull();
  });
});

describe('StatisticsService.trend', () => {
  it('produces a continuous day series with zero-filled gaps', () => {
    const rows = [
      row({ id: 1, startedAt: BASE + 3_600_000, status: 'SUCCESS', totalTokens: 100 }),
      row({ id: 2, startedAt: BASE + 2 * DAY + 3_600_000, status: 'ERROR', totalTokens: 50 }),
    ];
    const trend = StatisticsService.trend(rows, { from: BASE, to: BASE + 3 * DAY }, 'day');
    expect(trend).toHaveLength(3);
    expect(trend[0]).toMatchObject({ requestCount: 1, successCount: 1, errorCount: 0, totalTokens: 100, bucketStart: BASE });
    expect(trend[1]).toMatchObject({ requestCount: 0, totalTokens: 0, avgDurationMs: null });
    expect(trend[2]).toMatchObject({ requestCount: 1, successCount: 0, errorCount: 1, totalTokens: 50, bucketStart: BASE + 2 * DAY });
  });

  it('buckets by calendar month', () => {
    const month1 = Date.UTC(2026, 7, 15); // 2026-08-15
    const month2 = Date.UTC(2026, 8, 2); // 2026-09-02
    const trend = StatisticsService.trend(
      [
        makeRow({ id: 1, startedAt: month1, totalTokens: 10 }),
        makeRow({ id: 2, startedAt: month2, totalTokens: 20 }),
      ],
      { from: Date.UTC(2026, 7, 1), to: Date.UTC(2026, 9, 1) },
      'month',
    );
    expect(trend).toHaveLength(2);
    expect(trend[0]).toMatchObject({ bucketStart: Date.UTC(2026, 7, 1), requestCount: 1, totalTokens: 10 });
    expect(trend[1]).toMatchObject({ bucketStart: Date.UTC(2026, 8, 1), requestCount: 1, totalTokens: 20 });
  });
});

describe('StatisticsService grouping', () => {
  const rows = [
    row({ id: 1, provider: 'p1', model: 'm1', status: 'SUCCESS', totalTokens: 100, durationMs: 1000 }),
    row({ id: 2, provider: 'p1', model: 'm1', status: 'SUCCESS', totalTokens: 200, durationMs: 2000 }),
    row({ id: 3, provider: 'p2', model: 'm2', status: 'ERROR', totalTokens: 400, durationMs: 3000 }),
  ];

  it('groups by provider, sorted by total tokens desc', () => {
    const stats = StatisticsService.providerStats(rows);
    expect(stats.map((s) => s.provider)).toEqual(['p2', 'p1']);
    expect(stats[1]).toMatchObject({ provider: 'p1', requestCount: 2, successCount: 2, successRate: 1, totalTokens: 300, p95DurationMs: 2000 });
  });

  it('groups by provider+model', () => {
    const stats = StatisticsService.modelStats(rows);
    expect(stats).toHaveLength(2);
    const m1 = stats.find((s) => s.model === 'm1')!;
    expect(m1).toMatchObject({ provider: 'p1', model: 'm1', requestCount: 2, totalTokens: 300 });
  });

  it('groups by session', () => {
    const sessions = StatisticsService.sessionStats([
      row({ id: 1, sessionId: 'sA', startedAt: BASE, completedAt: BASE + 1000, totalTokens: 100 }),
      row({ id: 2, sessionId: 'sA', startedAt: BASE + 5000, completedAt: BASE + 6000, totalTokens: 200 }),
      row({ id: 3, sessionId: 'sB', startedAt: BASE, completedAt: BASE + 100, totalTokens: 50, status: 'ERROR' }),
    ]);
    expect(sessions).toHaveLength(2);
    const sA = sessions.find((s) => s.sessionId === 'sA')!;
    expect(sA).toMatchObject({ requestCount: 2, successCount: 2, successRate: 1, totalTokens: 300, durationMs: 6000, startedAt: BASE, endedAt: BASE + 6000 });
  });
});
