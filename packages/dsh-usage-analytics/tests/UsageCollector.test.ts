import { describe, expect, it, vi } from 'vitest';
import { UsageCollector } from '../src/collector/UsageCollector.js';
import type { UsageRecord } from '../src/model/UsageRecord.js';
import { event } from './fixtures.js';

function collect(opts: { onRecord?: (r: UsageRecord) => void } = {}) {
  const records: UsageRecord[] = [];
  const collector = new UsageCollector({
    onRecord: opts.onRecord ?? ((r) => records.push(r)),
  });
  return { collector, records };
}

describe('UsageCollector', () => {
  it('emits one record for a full raw event lifecycle', () => {
    const { collector, records } = collect();
    collector.ingest('s1', event('request/context', 5, 900, { provider: 'deepseek', model: 'v4', contextWindow: 128000 }));
    collector.ingest('s1', event('step/start', 10, 1000, { turn: 1, step: 0 }));
    collector.ingest('s1', event('assistant/chunk', 11, 1100, { turn: 1, step: 0, chunk: { type: 'text-delta', index: 0, text: 'a' } }));
    collector.ingest(
      's1',
      event('assistant/message', 12, 1200, {
        turn: 1,
        step: 0,
        message: { source: { kind: 'model', provider: 'deepseek', model: 'v4' }, content: [] },
        usage: { inputTokens: 10, outputTokens: 2 },
      }),
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ sessionId: 's1', turn: 1, step: 0, status: 'SUCCESS', usageSource: 'PROVIDER' });
    expect(records[0]!.usage!.totalTokens).toBe(12);
  });

  it('skips seed events below firstLiveSeq', () => {
    const { collector, records } = collect();
    collector.ingest('s1', event('step/start', 3, 1000, { turn: 1, step: 0 }), { firstLiveSeq: 10 });
    collector.ingest(
      's1',
      event('assistant/message', 4, 1100, {
        turn: 1,
        step: 0,
        message: { source: { provider: 'p', model: 'm' }, content: [] },
        usage: { inputTokens: 1, outputTokens: 1 },
      }),
      { firstLiveSeq: 10 },
    );
    expect(records).toHaveLength(0);
  });

  it('is fail-open when the sink throws', () => {
    const onRecord = vi.fn(() => {
      throw new Error('sink boom');
    });
    const { collector } = collect({ onRecord });
    expect(() => {
      collector.ingest('s1', event('step/start', 10, 1000, { turn: 1, step: 0 }));
      collector.ingest(
        's1',
        event('assistant/message', 12, 1200, {
          turn: 1,
          step: 0,
          message: { source: { provider: 'p', model: 'm' }, content: [] },
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      );
    }).not.toThrow();
    expect(onRecord).toHaveBeenCalledTimes(1);
  });

  it('is fail-open on malformed event payloads', () => {
    const { collector, records } = collect();
    expect(() => {
      collector.ingest('s1', { type: 'assistant/message', seq: 12, time: 1200, data: { turn: 'bad', step: null } } as never);
      collector.ingest('s1', { type: 'step/start' } as never);
    }).not.toThrow();
    expect(records).toHaveLength(0);
  });

  it('closes open started requests on session disposal', () => {
    const { collector, records } = collect();
    collector.ingest('s1', event('step/start', 10, 1000, { turn: 1, step: 0 }));
    collector.ingest('s1', event('assistant/chunk', 11, 1050, { turn: 1, step: 0, chunk: { type: 'text-delta', index: 0, text: 'x' } }));
    collector.sessionDisposed('s1');
    expect(records).toHaveLength(1);
    expect(records[0]!.status).toBe('UNKNOWN');
  });

  it('records an error path from raw events (step/end then turn/end error)', () => {
    const { collector, records } = collect();
    collector.ingest('s1', event('step/start', 10, 1000, { turn: 1, step: 0 }));
    collector.ingest('s1', event('assistant/chunk', 11, 1050, { turn: 1, step: 0, chunk: { type: 'text-delta', index: 0, text: 'x' } }));
    collector.ingest('s1', event('step/end', 12, 1100, { turn: 1, step: 0 }));
    collector.ingest('s1', event('turn/end', 13, 1500, { turn: 1, reason: { kind: 'error', error: { message: 'boom', code: 'E' } } }));
    expect(records).toHaveLength(1);
    expect(records[0]!.status).toBe('ERROR');
    expect(records[0]!.error!.code).toBe('E');
  });

  it('uses the estimate hook through the collector', () => {
    const records: UsageRecord[] = [];
    const collector = new UsageCollector({
      estimate: () => ({ inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, totalTokens: 2 }),
      onRecord: (r) => records.push(r),
    });
    collector.ingest('s1', event('step/start', 10, 1000, { turn: 1, step: 0 }));
    collector.ingest(
      's1',
      event('assistant/message', 12, 1200, {
        turn: 1,
        step: 0,
        message: { source: { provider: 'p', model: 'm' }, content: [] },
      }),
    );
    expect(records).toHaveLength(1);
    expect(records[0]!.usageSource).toBe('ESTIMATED');
    expect(records[0]!.usage!.totalTokens).toBe(2);
  });

  it('ignores unrelated event types', () => {
    const { collector, records } = collect();
    collector.ingest('s1', event('user/message', 10, 1000, { turn: 1 }));
    collector.ingest('s1', event('tool/call', 11, 1050, { turn: 1, step: 0, callId: 'c1', name: 'x', arguments: '{}' }));
    expect(records).toHaveLength(0);
  });
});
