import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsageLedger } from '../../src/storage/UsageLedger.js';
import { fakeTimer, makeRecord } from '../helpers.js';

const tempDirs: string[] = [];

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ua-ledger-'));
  tempDirs.push(dir);
  return join(dir, 'usage.sqlite');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const manual = { flushIntervalMs: 0, retentionIntervalMs: 0 };

describe('UsageLedger', () => {
  it('buffers records and persists them on flush (one transaction)', () => {
    const ledger = UsageLedger.open({ dbPath: ':memory:', ...manual });
    try {
      ledger.push(makeRecord({ seq: 1 }));
      ledger.push(makeRecord({ seq: 2, turn: 1, step: 1 }));
      expect(ledger.count()).toBe(0); // buffered, not yet persisted
      ledger.flush();
      expect(ledger.count()).toBe(2);
    } finally {
      ledger.dispose();
    }
  });

  it('auto-flushes when the batch size is reached', () => {
    const ledger = UsageLedger.open({ dbPath: ':memory:', flushIntervalMs: 0, flushBatchSize: 3, retentionIntervalMs: 0 });
    try {
      for (let i = 0; i < 3; i++) ledger.push(makeRecord({ seq: i + 1, turn: 1, step: i }));
      expect(ledger.count()).toBe(3);
    } finally {
      ledger.dispose();
    }
  });

  it('persists a full lifecycle record end-to-end', () => {
    const ledger = UsageLedger.open({ dbPath: ':memory:', ...manual });
    try {
      ledger.push(makeRecord());
      ledger.flush();
      const row = ledger.recent(1)[0]!;
      expect(row).toMatchObject({
        sessionId: 's1',
        turn: 1,
        step: 0,
        status: 'SUCCESS',
        usageSource: 'PROVIDER',
        inputTokens: 10,
        totalTokens: 17,
        provider: 'deepseek',
      });
    } finally {
      ledger.dispose();
    }
  });

  it('runs retention on demand through the ledger', () => {
    const ledger = UsageLedger.open({
      dbPath: ':memory:',
      ...manual,
      retention: { usageRecordsDays: 365 },
    });
    try {
      const now = Date.now();
      ledger.push(makeRecord({ seq: 1, completedAt: now - 400 * 24 * 60 * 60 * 1000 }));
      ledger.push(makeRecord({ seq: 2, turn: 1, step: 1, completedAt: now }));
      ledger.flush();
      const result = ledger.runRetention(now);
      expect(result.usageRecordsDeleted).toBe(1);
      expect(ledger.count()).toBe(1);
    } finally {
      ledger.dispose();
    }
  });

  it('runs an initial retention sweep and periodic sweeps via the timer', () => {
    const fake = fakeTimer();
    const ledger = UsageLedger.open({
      dbPath: ':memory:',
      flushIntervalMs: 0,
      retentionIntervalMs: 1000,
      retention: { usageRecordsDays: 365 },
      timer: fake.timer,
    });
    try {
      expect(fake.count()).toBe(1); // one periodic sweep registered
      ledger.push(makeRecord({ seq: 1, completedAt: Date.now() - 400 * 24 * 60 * 60 * 1000 }));
      ledger.flush();
      expect(ledger.count()).toBe(1);
      fake.fire(); // periodic sweep deletes the expired row
      expect(ledger.count()).toBe(0);
    } finally {
      ledger.dispose();
    }
  });

  it('dispose flushes pending records; later pushes are no-ops (verified on reopen)', () => {
    const path = tempFile();
    const ledger = UsageLedger.open({ dbPath: path, ...manual });
    ledger.push(makeRecord({ seq: 1 }));
    ledger.dispose(); // flushes seq 1 and closes
    ledger.dispose(); // idempotent
    ledger.push(makeRecord({ seq: 2 })); // no-op: disposed
    ledger.dispose();

    const reopened = UsageLedger.open({ dbPath: path, ...manual });
    try {
      expect(reopened.count()).toBe(1); // only the pre-dispose record landed
    } finally {
      reopened.dispose();
    }
  });

  it('persists to a real file and survives reopen', () => {
    const path = tempFile();
    const ledger1 = UsageLedger.open({ dbPath: path, ...manual });
    ledger1.push(makeRecord({ seq: 1 }));
    ledger1.flush();
    ledger1.dispose();

    const ledger2 = UsageLedger.open({ dbPath: path, ...manual });
    try {
      expect(ledger2.count()).toBe(1);
    } finally {
      ledger2.dispose();
    }
  });

  it('reports errors through onError when the sink fails (fail-open)', () => {
    const onError = vi.fn();
    const ledger = UsageLedger.open({ dbPath: ':memory:', ...manual, onError });
    try {
      ledger.push(makeRecord({ seq: 1 }));
      // simulate a storage failure by closing the underlying db out from under it
      (ledger as unknown as { db: DatabaseSync }).db.close();
      expect(() => ledger.flush()).not.toThrow();
      expect(onError).toHaveBeenCalled();
    } finally {
      ledger.dispose(); // second close must not throw
    }
  });
});
