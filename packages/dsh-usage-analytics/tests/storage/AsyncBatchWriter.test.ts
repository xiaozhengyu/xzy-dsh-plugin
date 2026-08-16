import { describe, expect, it, vi } from 'vitest';
import { AsyncBatchWriter } from '../../src/storage/AsyncBatchWriter.js';
import { fakeTimer } from '../helpers.js';

describe('AsyncBatchWriter', () => {
  it('flushes immediately when the batch size is reached', () => {
    const sink = vi.fn();
    const writer = new AsyncBatchWriter<number>({ batchSize: 2, flushIntervalMs: 0, flush: sink });
    writer.push(1);
    expect(sink).not.toHaveBeenCalled();
    writer.push(2);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith([1, 2]);
    writer.dispose();
  });

  it('flushes on the interval timer', () => {
    const fake = fakeTimer();
    const sink = vi.fn();
    const writer = new AsyncBatchWriter<number>({ flushIntervalMs: 100, flush: sink, timer: fake.timer });
    writer.push(1);
    expect(sink).not.toHaveBeenCalled();
    fake.fire();
    expect(sink).toHaveBeenCalledWith([1]);
    writer.dispose();
  });

  it('flushes manually on demand', () => {
    const sink = vi.fn();
    const writer = new AsyncBatchWriter<number>({ flushIntervalMs: 0, flush: sink });
    writer.push(1);
    writer.push(2);
    writer.flush();
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith([1, 2]);
    writer.dispose();
  });

  it('flush with nothing pending is a no-op', () => {
    const sink = vi.fn();
    const writer = new AsyncBatchWriter<number>({ flushIntervalMs: 0, flush: sink });
    writer.flush();
    expect(sink).not.toHaveBeenCalled();
    writer.dispose();
  });

  it('dispose flushes pending items and is idempotent', () => {
    const sink = vi.fn();
    const writer = new AsyncBatchWriter<number>({ flushIntervalMs: 0, flush: sink });
    writer.push(7);
    writer.dispose();
    writer.dispose();
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith([7]);
  });

  it('is fail-open when the sink throws: drops the batch, notifies onError, keeps working', () => {
    const onError = vi.fn();
    const sink = vi.fn(() => {
      throw new Error('disk full');
    });
    const writer = new AsyncBatchWriter<number>({ batchSize: 2, flushIntervalMs: 0, flush: sink, onError });
    writer.push(1); // buffered, no flush yet
    expect(() => writer.flush()).not.toThrow(); // sink throws → contained
    expect(onError).toHaveBeenCalledTimes(1);
    expect(writer.pending).toBe(0); // the failed batch is dropped
    writer.push(2); // writer keeps accepting new items
    expect(writer.pending).toBe(1);
    writer.dispose(); // flush fails again → notified, no throw
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('reports pending count', () => {
    const writer = new AsyncBatchWriter<number>({ flushIntervalMs: 0, flush: () => undefined });
    writer.push(1);
    writer.push(2);
    expect(writer.pending).toBe(2);
    writer.dispose();
  });
});
