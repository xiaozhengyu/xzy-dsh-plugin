import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { AssistantMessageLike, UsageBuckets } from '../model/types.js';
import type { UsageRecord } from '../model/UsageRecord.js';
import { normalizeEvent } from './EventNormalizer.js';
import { RequestTracker } from './RequestTracker.js';

export interface UsageCollectorLogger {
  error?(message: string, ...args: unknown[]): void;
  debug?(message: string, ...args: unknown[]): void;
}

export interface UsageCollectorOptions {
  /** Called for every finalized UsageRecord. Failures inside the sink are contained. */
  onRecord?: (record: UsageRecord) => void;
  /** Optional estimator producing ESTIMATED buckets when provider usage is absent. */
  estimate?: (message: AssistantMessageLike) => UsageBuckets | undefined;
  logger?: UsageCollectorLogger;
}

export interface IngestContext {
  /**
   * Defensive replay guard: seeds (resume/fork/replay) never publish on
   * `session/event`, so events with `seq < firstLiveSeq` are skipped explicitly.
   */
  firstLiveSeq?: number;
}

/**
 * Phase 1 collector: normalizes the `session/event` firehose into finalized
 * `UsageRecord`s. Context-free (no DSH runtime dependency) and fail-open —
 * any error, including a throwing `onRecord` sink, is logged and never
 * rethrown into the event dispatch chain (Analytics must not break the agent).
 */
export class UsageCollector {
  private readonly tracker: RequestTracker;
  private readonly options: UsageCollectorOptions;

  constructor(options: UsageCollectorOptions = {}) {
    this.options = options;
    this.tracker = new RequestTracker({ estimate: options.estimate });
  }

  /** Feed one committed session event. Never throws. */
  ingest(sessionId: string, event: SessionEvent, context: IngestContext = {}): void {
    try {
      if (context.firstLiveSeq !== undefined && event.seq < context.firstLiveSeq) return;
      const normalized = normalizeEvent(sessionId, event);
      if (!normalized) return;
      for (const record of this.tracker.handle(normalized)) this.emit(record);
    } catch (error) {
      this.logError('dsh-usage-analytics: event handling failed (fail-open)', error);
    }
  }

  /** Close still-open requests of a disposed session as UNKNOWN. Never throws. */
  sessionDisposed(sessionId: string): void {
    try {
      for (const record of this.tracker.closeSession(sessionId)) this.emit(record);
    } catch (error) {
      this.logError('dsh-usage-analytics: session disposal failed (fail-open)', error);
    }
  }

  /** Close every still-open request (plugin flush / dispose). Never throws. */
  flush(): void {
    try {
      for (const record of this.tracker.closeAll()) this.emit(record);
    } catch (error) {
      this.logError('dsh-usage-analytics: flush failed (fail-open)', error);
    }
  }

  private emit(record: UsageRecord): void {
    try {
      this.options.onRecord?.(record);
    } catch (error) {
      this.logError('dsh-usage-analytics: onRecord sink failed (fail-open)', error);
    }
  }

  private logError(message: string, error: unknown): void {
    try {
      this.options.logger?.error?.(message, error);
    } catch {
      // logging itself must never break collection
    }
  }
}
