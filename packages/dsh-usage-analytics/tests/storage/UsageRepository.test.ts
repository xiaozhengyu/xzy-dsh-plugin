import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/storage/Migration.js';
import { UsageRepository } from '../../src/storage/UsageRepository.js';
import { makeRecord } from '../helpers.js';

function repo(): { db: DatabaseSync; repository: UsageRepository } {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return { db, repository: new UsageRepository(db) };
}

describe('UsageRepository', () => {
  it('round-trips a full record', () => {
    const { db, repository } = repo();
    try {
      const record = makeRecord();
      repository.insertRecord(record, 5000);
      expect(repository.count()).toBe(1);
      const rows = repository.recent(10);
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.sessionId).toBe('s1');
      expect(row.seq).toBe(12);
      expect(row.provider).toBe('deepseek');
      expect(row.inputTokens).toBe(10);
      expect(row.cacheReadTokens).toBe(2);
      expect(row.totalTokens).toBe(17);
      expect(row.usageSource).toBe('PROVIDER');
      expect(row.status).toBe('SUCCESS');
      expect(row.finishReason).toBe('stop');
      expect(row.hasToolCalls).toBe(0);
      expect(row.createdAt).toBe(5000);
    } finally {
      db.close();
    }
  });

  it('is idempotent on (session_id, seq): duplicates are ignored, first wins', () => {
    const { db, repository } = repo();
    try {
      repository.insertRecord(makeRecord({ seq: 12, durationMs: 1000 }));
      repository.insertRecord(makeRecord({ seq: 12, durationMs: 9999 }));
      expect(repository.count()).toBe(1);
      expect(repository.recent(10)[0]!.durationMs).toBe(1000);
    } finally {
      db.close();
    }
  });

  it('allows multiple disposal-time records without a seq (NULL seq never collides)', () => {
    const { db, repository } = repo();
    try {
      repository.insertRecord(makeRecord({ seq: undefined, sessionId: 's1' }));
      repository.insertRecord(makeRecord({ seq: undefined, sessionId: 's1', turn: 1, step: 1 }));
      repository.insertRecord(makeRecord({ seq: undefined, sessionId: 's2' }));
      expect(repository.count()).toBe(3);
    } finally {
      db.close();
    }
  });

  it('persists error facts for failed requests', () => {
    const { db, repository } = repo();
    try {
      repository.insertRecord(
        makeRecord({
          status: 'ERROR',
          usageSource: 'UNKNOWN',
          usage: undefined,
          error: { code: 'RATE_LIMITED', message: 'upstream 429', requestId: 'req-1' },
        }),
      );
      const row = repository.recent(10)[0]!;
      expect(row.errorCode).toBe('RATE_LIMITED');
      expect(row.errorMessage).toBe('upstream 429');
      expect(row.errorRequestId).toBe('req-1');
      expect(row.inputTokens).toBeNull();
    } finally {
      db.close();
    }
  });

  it('inserts and deletes raw events', () => {
    const { db, repository } = repo();
    try {
      repository.insertRawEvent({
        sessionId: 's1',
        turn: 1,
        step: 0,
        eventType: 'assistant/message',
        eventSeq: 12,
        eventTime: 1000,
        payloadJson: '{"type":"assistant/message"}',
      });
      const deleted = repository.deleteRawEventsBefore(2000);
      expect(deleted).toBe(1);
    } finally {
      db.close();
    }
  });
});
