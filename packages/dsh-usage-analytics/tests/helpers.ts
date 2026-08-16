import type { UsageRecord } from '../src/model/UsageRecord.js';
import type { Timer } from '../src/storage/AsyncBatchWriter.js';
import type { UsageRecordRow } from '../src/storage/UsageRepository.js';

/** Build a full UsageRecord with sane defaults; override any field. */
export function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    sessionId: 's1',
    turn: 1,
    step: 0,
    seq: 12,
    startedAt: 1000,
    completedAt: 2000,
    durationMs: 1000,
    provider: 'deepseek',
    model: 'deepseek-v4',
    contextWindow: 128000,
    usage: { inputTokens: 10, cacheReadTokens: 2, cacheWriteTokens: 0, outputTokens: 5, totalTokens: 17 },
    usageSource: 'PROVIDER',
    finishReason: 'stop',
    status: 'SUCCESS',
    hasToolCalls: false,
    firstTokenAt: 1100,
    ttftMs: 100,
    ...overrides,
  };
}

/** Build a full UsageRecordRow (as read back from SQLite); override any field. */
export function makeRow(overrides: Partial<UsageRecordRow> = {}): UsageRecordRow {
  return {
    id: 1,
    sessionId: 's1',
    turn: 1,
    step: 0,
    seq: 12,
    startedAt: 1000,
    completedAt: 2000,
    durationMs: 1000,
    provider: 'deepseek',
    model: 'deepseek-v4',
    contextWindow: 128000,
    inputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 50,
    totalTokens: 150,
    reasoningTokens: null,
    usageSource: 'PROVIDER',
    finishReason: 'stop',
    status: 'SUCCESS',
    errorCode: null,
    errorMessage: null,
    errorRequestId: null,
    hasToolCalls: 0,
    firstTokenAt: null,
    ttftMs: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

/** Manual timer for tests: fires registered callbacks on demand, never on real time. */
export function fakeTimer(): { timer: Timer; fire(): void; count(): number } {
  const fns: Array<() => void> = [];
  return {
    timer: {
      set(fn) {
        fns.push(fn);
        return { dispose: () => undefined };
      },
    },
    fire() {
      for (const fn of [...fns]) fn();
    },
    count() {
      return fns.length;
    },
  };
}
