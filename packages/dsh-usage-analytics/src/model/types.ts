/**
 * Plugin-internal model vocabulary.
 *
 * These shapes are deliberately DSH-agnostic: `EventNormalizer` is the only
 * module that touches `@deepseek-ai/*` types; everything downstream
 * (RequestTracker, collector, Phase 2 ledger) works on these plain structural
 * shapes, so unit tests never need a DSH runtime.
 */

/** Provider-reported usage buckets, structurally matching `TokenUsage` from `@deepseek-ai/dsh-llm`. */
export interface TokenUsageLike {
  /** Uncached input tokens only — buckets are DISJOINT: billed input = input + cacheRead + cacheWrite. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Already included in outputTokens; kept for display only, never re-accumulated. */
  reasoningTokens?: number;
}

/** Structurally matches `LlmFailure` from `@deepseek-ai/dsh-llm`. */
export interface LlmFailureLike {
  message: string;
  code: string;
  status?: number;
  providerRetryAfterMs?: number;
  /** Opaque provider-issued request id (only present on failures). */
  requestId?: string;
}

/** Structurally matches the `finish` variant's `reason` in `StreamChunk`. */
export interface FinishReasonLike {
  kind: string;
  failure?: LlmFailureLike;
}

/** Structurally matches `StreamChunk` from `@deepseek-ai/dsh-llm`. */
export interface StreamChunkLike {
  type: string;
  index?: number;
  text?: string;
  usage?: TokenUsageLike;
  reason?: FinishReasonLike;
  block?: { type?: string };
  id?: string;
}

/** Structurally matches `ModelMessageSource` from `@deepseek-ai/dsh-llm`. */
export interface ModelMessageSourceLike {
  kind?: string;
  provider?: string;
  model?: string;
}

/** Structurally matches `AssistantMessage` from `@deepseek-ai/dsh-llm` (fields we read). */
export interface AssistantMessageLike {
  source?: ModelMessageSourceLike;
  content?: ReadonlyArray<{ type?: string }>;
}

/** Structurally matches `TurnEndReason` from `@deepseek-ai/dsh-session`. */
export interface TurnEndReasonLike {
  kind: string;
  error?: LlmFailureLike;
}

/** Request outcome as surfaced by the analytics ledger. */
export type RequestStatus = 'SUCCESS' | 'ERROR' | 'ABORTED' | 'MAX_TOKENS' | 'UNKNOWN';

/** Where the recorded token numbers came from. */
export type UsageSource = 'PROVIDER' | 'ESTIMATED' | 'UNKNOWN';

/** Disjoint usage buckets as stored/queried by the analytics ledger. */
export interface UsageBuckets {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  /** input + cacheRead + cacheWrite + output (disjoint semantics, never adds reasoning again). */
  totalTokens: number;
  reasoningTokens?: number;
}

/** Convert provider-reported usage into the ledger buckets under the disjoint rule. */
export function tokenUsageToBuckets(usage: TokenUsageLike): UsageBuckets {
  const inputTokens = usage.inputTokens;
  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  const outputTokens = usage.outputTokens;
  return {
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens,
    totalTokens: inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens,
    ...(usage.reasoningTokens === undefined ? {} : { reasoningTokens: usage.reasoningTokens }),
  };
}
