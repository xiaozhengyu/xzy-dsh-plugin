/**
 * Debounced batched writer: buffers items in memory and flushes them to a
 * synchronous sink in batches, so hot paths never hit the database per item
 * (architecture doc §17/§22 — "chunk → in-memory state → async batch write").
 *
 * Fail-open: the sink may throw; the batch is dropped, `onError` is notified
 * (best effort), and the writer keeps working. Analytics must never break the
 * agent, so a failing database degrades analytics instead of throwing.
 */

/** Injectable timer (tests use a fake; production uses setInterval). */
export interface Timer {
  set(fn: () => void, ms: number): { dispose(): void };
}

export const defaultTimer: Timer = {
  set(fn, ms) {
    const id = setInterval(fn, ms);
    return { dispose: () => clearInterval(id) };
  },
};

export interface AsyncBatchWriterOptions<T> {
  /** Flush when the buffer reaches this size. Default 100. */
  batchSize?: number;
  /** Debounce interval in ms; 0 disables the interval timer. Default 1000. */
  flushIntervalMs?: number;
  /** Synchronous sink performing the actual persistence. May throw (contained). */
  flush(records: readonly T[]): void;
  onError?(error: unknown): void;
  timer?: Timer;
}

export class AsyncBatchWriter<T> {
  private buffer: T[] = [];
  private readonly options: AsyncBatchWriterOptions<T>;
  private timer?: { dispose(): void };

  constructor(options: AsyncBatchWriterOptions<T>) {
    this.options = options;
    const interval = options.flushIntervalMs ?? 1000;
    if (interval > 0) {
      const timer = options.timer ?? defaultTimer;
      this.timer = timer.set(() => this.flush(), interval);
    }
  }

  /** Buffer one item; flushes immediately when the batch size is reached. Never throws. */
  push(item: T): void {
    this.buffer.push(item);
    if (this.buffer.length >= (this.options.batchSize ?? 100)) this.flush();
  }

  /** Number of buffered items (observability/tests). */
  get pending(): number {
    return this.buffer.length;
  }

  /** Synchronously write the whole buffer (best effort, fail-open). Never throws. */
  flush(): void {
    if (this.buffer.length === 0) return;
    const records = this.buffer;
    this.buffer = [];
    try {
      this.options.flush(records);
    } catch (error) {
      try {
        this.options.onError?.(error);
      } catch {
        // error reporting itself must never break collection
      }
    }
  }

  /** Stop the timer and flush any pending items. Idempotent. */
  dispose(): void {
    this.timer?.dispose();
    this.timer = undefined;
    this.flush();
  }
}
