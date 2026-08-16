import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { RetentionService, retentionCutoff } from '../../src/service/RetentionService.js';
import { runMigrations } from '../../src/storage/Migration.js';
import { UsageRepository } from '../../src/storage/UsageRepository.js';
import { makeRecord } from '../helpers.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function setup() {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return { db, repository: new UsageRepository(db) };
}

describe('retentionCutoff', () => {
  it('computes day windows and null for forever', () => {
    expect(retentionCutoff(1000, 7)).toBe(1000 - 7 * DAY);
    expect(retentionCutoff(1000, 'forever')).toBeNull();
  });
});

describe('RetentionService', () => {
  it('deletes expired usage records and keeps fresh ones', () => {
    const { db, repository } = setup();
    try {
      repository.insertRecord(makeRecord({ sessionId: 'old', seq: 1, completedAt: NOW - 400 * DAY }));
      repository.insertRecord(makeRecord({ sessionId: 'new', seq: 2, completedAt: NOW - 1 * DAY }));
      const service = new RetentionService(db, { usageRecordsDays: 365 });
      const result = service.run(NOW);
      expect(result.usageRecordsDeleted).toBe(1);
      const remaining = repository
        .recent(10)
        .map((r) => r.sessionId)
        .sort();
      expect(remaining).toEqual(['new']);
    } finally {
      db.close();
    }
  });

  it('deletes expired raw events and keeps fresh ones', () => {
    const { db, repository } = setup();
    try {
      repository.insertRawEvent({ sessionId: 's1', turn: 1, step: 0, eventType: 'a', eventSeq: 1, eventTime: NOW - 10 * DAY, payloadJson: '{}' });
      repository.insertRawEvent({ sessionId: 's1', turn: 1, step: 1, eventType: 'b', eventSeq: 2, eventTime: NOW - 1 * DAY, payloadJson: '{}' });
      const service = new RetentionService(db, { rawEventsDays: 7 });
      const result = service.run(NOW);
      expect(result.rawEventsDeleted).toBe(1);
    } finally {
      db.close();
    }
  });

  it("keeps everything with 'forever'", () => {
    const { db, repository } = setup();
    try {
      repository.insertRecord(makeRecord({ sessionId: 'old', seq: 1, completedAt: NOW - 1000 * DAY }));
      const service = new RetentionService(db, { usageRecordsDays: 'forever', rawEventsDays: 'forever' });
      const result = service.run(NOW);
      expect(result.usageRecordsDeleted).toBe(0);
      expect(repository.count()).toBe(1);
    } finally {
      db.close();
    }
  });
});
