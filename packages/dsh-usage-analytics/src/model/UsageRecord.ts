import type { RequestStatus, UsageBuckets, UsageSource } from './types.js';

/** Structured failure facts recorded for ERROR / ABORTED requests. */
export interface RequestErrorInfo {
  code: string;
  message: string;
  requestId?: string;
}

/**
 * One finalized LLM request, produced by the Phase 1 collector.
 *
 * Correlation key: `(sessionId, turn, step)` — DSH session events carry no
 * per-request id (see doc/harness-api.md §8). Idempotency at the ledger layer
 * (Phase 2) uses `(sessionId, seq)`; `seq` here is the finalizing event's seq
 * and is absent only for disposal-time closes.
 */
export interface UsageRecord {
  sessionId: string;
  turn: number;
  step: number;
  /** Seq of the finalizing event (assistant/message, step/end, or turn/end); absent on disposal close. */
  seq?: number;
  /** Unix epoch ms of step/start. */
  startedAt: number;
  /** Unix epoch ms of the finalizing event (or disposal time). */
  completedAt: number;
  /** completedAt - startedAt, clamped to >= 0. */
  durationMs: number;
  provider?: string;
  model?: string;
  contextWindow?: number;
  /** Present unless usageSource is UNKNOWN. */
  usage?: UsageBuckets;
  usageSource: UsageSource;
  /** Normalized finish kind: stop | tool-calls | max-tokens | aborted | error | completed | blocked | interrupted | unknown. */
  finishReason?: string;
  status: RequestStatus;
  error?: RequestErrorInfo;
  /** True when the assistant message content carried tool calls (never a failure by itself). */
  hasToolCalls: boolean;
  /** Unix epoch ms of the first text-delta chunk, when observed. */
  firstTokenAt?: number;
  /** firstTokenAt - startedAt, when both are known. */
  ttftMs?: number;
}
