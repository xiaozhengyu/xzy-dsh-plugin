import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { CostService, StaticPricingProvider } from '../../src/service/CostService.js';
import { UsageService } from '../../src/service/UsageService.js';
import { runMigrations } from '../../src/storage/Migration.js';
import { UsageLedger } from '../../src/storage/UsageLedger.js';
import { UsageRepository } from '../../src/storage/UsageRepository.js';
import { makeRecord } from '../helpers.js';

const DAY = 24 * 3_600_000;
const BASE = 1786752000000; // 2026-08-16T00:00:00Z

interface Env {
  db: DatabaseSync;
  repository: UsageRepository;
  service: UsageService;
}

function setup(service?: UsageService): Env {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  const repository = new UsageRepository(db);
  return { db, repository, service: service ?? new UsageService(repository) };
}

function seed(env: Env): void {
  env.repository.insertRecord(
    makeRecord({ sessionId: 's1', turn: 1, step: 0, seq: 1, startedAt: BASE + 3_600_000, completedAt: BASE + 3_601_000, durationMs: 1000, provider: 'deepseek', model: 'deepseek-v4', usage: { inputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 50, totalTokens: 150 } }),
  );
  env.repository.insertRecord(
    makeRecord({ sessionId: 's1', turn: 1, step: 1, seq: 2, startedAt: BASE + 2 * 3_600_000, completedAt: BASE + 2 * 3_600_000 + 2000, durationMs: 2000, provider: 'p2', model: 'm2', status: 'ERROR', usageSource: 'UNKNOWN', usage: undefined, error: { code: 'E1', message: 'boom' } }),
  );
  env.repository.insertRecord(
    makeRecord({ sessionId: 's2', turn: 1, step: 0, seq: 3, startedAt: BASE + 3 * 3_600_000, completedAt: BASE + 3 * 3_600_000 + 3000, durationMs: 3000, provider: 'deepseek', model: 'deepseek-v4', usage: { inputTokens: 200, cacheReadTokens: 100, cacheWriteTokens: 0, outputTokens: 30, totalTokens: 330 } }),
  );
}

const RANGE = { from: BASE, to: BASE + DAY };

describe('UsageService', () => {
  it('getOverview aggregates the range', () => {
    const env = setup();
    seed(env);
    try {
      const o = env.service.getOverview(RANGE);
      expect(o.requestCount).toBe(3);
      expect(o.successCount).toBe(2);
      expect(o.errorCount).toBe(1);
      expect(o.totalTokens).toBe(480);
      expect(o.cacheHitRate).toBeCloseTo(100 / 400); // cacheRead / (input + cacheRead + cacheWrite)
      expect(o.p95DurationMs).toBe(3000);
    } finally {
      env.db.close();
    }
  });

  it('getTrend returns a continuous series', () => {
    const env = setup();
    seed(env);
    try {
      const trend = env.service.getTrend(RANGE, 'day');
      expect(trend).toHaveLength(1);
      expect(trend[0]!.requestCount).toBe(3);
      expect(trend[0]!.totalTokens).toBe(480);
    } finally {
      env.db.close();
    }
  });

  it('getProviderStats and getModelStats group correctly', () => {
    const env = setup();
    seed(env);
    try {
      const providers = env.service.getProviderStats(RANGE);
      expect(providers.map((p) => p.provider)).toEqual(['deepseek', 'p2']);
      expect(providers[0]).toMatchObject({ requestCount: 2, successCount: 2, successRate: 1, totalTokens: 480 });

      const models = env.service.getModelStats(RANGE);
      expect(models.find((m) => m.model === 'm2')).toMatchObject({ provider: 'p2', requestCount: 1, errorCount: 1 });
    } finally {
      env.db.close();
    }
  });

  it('listRequests filters, sorts and paginates', () => {
    const env = setup();
    seed(env);
    try {
      const all = env.service.listRequests({ ...RANGE });
      expect(all.total).toBe(3);
      expect(all.items).toHaveLength(3);

      const byStatus = env.service.listRequests({ ...RANGE, status: 'SUCCESS' });
      expect(byStatus.total).toBe(2);

      const byProvider = env.service.listRequests({ ...RANGE, provider: 'deepseek' });
      expect(byProvider.total).toBe(2);

      const bySearch = env.service.listRequests({ ...RANGE, search: 'boom' });
      expect(bySearch.total).toBe(1);

      const byDuration = env.service.listRequests({ ...RANGE, sortBy: 'duration', order: 'desc' });
      expect(byDuration.items.map((r) => r.durationMs)).toEqual([3000, 2000, 1000]);

      const paged = env.service.listRequests({ ...RANGE, offset: 1, limit: 1 });
      expect(paged.items).toHaveLength(1);
      expect(paged.total).toBe(3);
    } finally {
      env.db.close();
    }
  });

  it('getRequest returns one row by id', () => {
    const env = setup();
    seed(env);
    try {
      const first = env.service.listRequests({ ...RANGE, limit: 1 });
      const byId = env.service.getRequest(first.items[0]!.id);
      expect(byId?.id).toBe(first.items[0]!.id);
      expect(byId?.sessionId).toBe(first.items[0]!.sessionId);
      expect(env.service.getRequest(99999)).toBeUndefined();
    } finally {
      env.db.close();
    }
  });

  it('listSessions and getSession aggregate per session', () => {
    const env = setup();
    seed(env);
    try {
      const sessions = env.service.listSessions(RANGE);
      expect(sessions).toHaveLength(2);
      const s1 = sessions.find((s) => s.sessionId === 's1')!;
      expect(s1).toMatchObject({ requestCount: 2, successCount: 1, errorCount: 1, totalTokens: 150 });

      const detail = env.service.getSession('s1');
      expect(detail?.session.requestCount).toBe(2);
      expect(detail?.requests).toHaveLength(2);
      expect(env.service.getSession('nope')).toBeUndefined();
    } finally {
      env.db.close();
    }
  });

  it('getCostOverview returns undefined without pricing and aggregates with it', () => {
    const envNoCost = setup();
    seed(envNoCost);
    try {
      expect(envNoCost.service.getCostOverview(RANGE)).toBeUndefined();
    } finally {
      envNoCost.db.close();
    }
  });

  it('reports cost when constructed with a CostService', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const repository = new UsageRepository(db);
    const cost = new CostService({
      pricing: new StaticPricingProvider({
        deepseek: { 'deepseek-v4': { input: 0.1, cacheRead: 0.05, cacheWrite: 0, output: 0.2 } },
      }),
    });
    const service = new UsageService(repository, cost);
    seed({ db, repository, service });
    try {
      const overview = service.getCostOverview(RANGE)!;
      // s1 step0: 100/1000*0.1 + 50/1000*0.2 = 0.01+0.01 = 0.02
      // s2: 200/1000*0.1 + 100/1000*0.05 + 30/1000*0.2 = 0.02+0.005+0.006 = 0.031
      expect(overview.total).toBeCloseTo(0.051);
      expect(overview.byModel['deepseek/deepseek-v4']!.total).toBeCloseTo(0.051);
      // p2 record has no pricing → excluded
      expect(overview.byProvider['p2']).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('UsageLedger.query() exposes the service over persisted records', () => {
    const ledger = UsageLedger.open({ dbPath: ':memory:', flushIntervalMs: 0, retentionIntervalMs: 0 });
    try {
      ledger.push(makeRecord({ sessionId: 's1', turn: 1, step: 0, seq: 1, startedAt: BASE, completedAt: BASE + 1000, durationMs: 1000, usage: { inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 5, totalTokens: 15 } }));
      ledger.flush();
      const overview = ledger.query().getOverview({ from: BASE, to: BASE + DAY });
      expect(overview.requestCount).toBe(1);
      expect(overview.totalTokens).toBe(15);
    } finally {
      ledger.dispose();
    }
  });
});
