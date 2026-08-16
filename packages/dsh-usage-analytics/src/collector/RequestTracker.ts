import type {
  AssistantMessageLike,
  LlmFailureLike,
  RequestStatus,
  StreamChunkLike,
  TokenUsageLike,
  TurnEndReasonLike,
  UsageBuckets,
  UsageSource,
} from '../model/types.js';
import { tokenUsageToBuckets } from '../model/types.js';
import type { RequestErrorInfo, UsageRecord } from '../model/UsageRecord.js';
import type { NormalizedEvent } from './EventNormalizer.js';

export interface RequestTrackerOptions {
  /**
   * Optional estimator: when the provider reports no usage on
   * `assistant/message`, produce ESTIMATED buckets from the message. Phase 2/3
   * will wire this to `ctx.tokenMeter`; absent by default (→ UNKNOWN).
   */
  estimate?: (message: AssistantMessageLike) => UsageBuckets | undefined;
}

interface ActiveRequest {
  key: string;
  sessionId: string;
  turn: number;
  step: number;
  startedAt: number;
  firstTokenAt?: number;
  provider?: string;
  model?: string;
  /** Any `assistant/chunk` seen — marks this step as a real (started) LLM call. */
  sawChunk: boolean;
  /** Provisional usage from `assistant/chunk` usage variants — replaced, never accumulated. */
  provisionalUsage?: TokenUsageLike;
  finishReason?: string;
  finishFailure?: LlmFailureLike;
  hasToolCalls: boolean;
  finalized: boolean;
}

interface SessionState {
  /** Latest `request/context` route facts. */
  route?: { provider?: string; model?: string; contextWindow?: number };
  /** Open requests keyed by `${turn}:${step}`. */
  active: Map<string, ActiveRequest>;
}

function stepKey(turn: number, step: number): string {
  return `${turn}:${step}`;
}

function toErrorInfo(failure: LlmFailureLike | undefined): RequestErrorInfo | undefined {
  if (!failure) return undefined;
  const info: RequestErrorInfo = { code: failure.code, message: failure.message };
  if (failure.requestId !== undefined) info.requestId = failure.requestId;
  return info;
}

/** Map a finish-chunk reason to request status. `stop`/`tool-calls` are success. */
function statusFromFinish(
  finishReason: string | undefined,
  failure: LlmFailureLike | undefined,
): { status: RequestStatus; error?: RequestErrorInfo } {
  switch (finishReason) {
    case 'stop':
    case 'tool-calls':
      return { status: 'SUCCESS' };
    case 'max-tokens':
      return { status: 'MAX_TOKENS' };
    case 'aborted':
      return { status: 'ABORTED', error: toErrorInfo(failure) };
    case 'error':
      return { status: 'ERROR', error: toErrorInfo(failure) };
    default:
      return { status: 'SUCCESS' };
  }
}

/**
 * Map a durable turn/end reason to request status. `turn/end` is the
 * authoritative close for requests that started streaming but never assembled
 * an `assistant/message` (the loop appends `step/end` in a finally and
 * `turn/end` after it, so a failed request's error lands here).
 */
function statusFromTurnEnd(reason: TurnEndReasonLike): { status: RequestStatus; error?: RequestErrorInfo } {
  switch (reason.kind) {
    case 'completed':
      return { status: 'SUCCESS' };
    case 'aborted':
      return { status: 'ABORTED', error: toErrorInfo(reason.error) };
    case 'error':
      return { status: 'ERROR', error: toErrorInfo(reason.error) };
    case 'max-tokens':
      return { status: 'MAX_TOKENS' };
    case 'blocked':
    case 'interrupted':
    default:
      return { status: 'UNKNOWN' };
  }
}

/**
 * Per-session request lifecycle state machine.
 *
 * Event order facts (locked against dsh-agent-loop rc.6): `step/end` is
 * appended in a finally around each step — BEFORE the turn's `turn/end`;
 * a failed request therefore closes at `turn/end {kind:'error'}` (or
 * aborted / max-tokens), never at `step/end`.
 *
 * Lifecycle rules:
 * - `step/start` opens a request.
 * - `assistant/chunk` only mutates in-memory provisional state and marks the
 *   step as a started LLM call (`sawChunk`).
 * - `assistant/message` finalizes immediately (success family + authoritative
 *   provider usage).
 * - `step/end` never determines the outcome: it discards steps with no LLM
 *   activity (tool/empty steps) and keeps started streams open for `turn/end`.
 * - `turn/end` closes every still-open started request of the turn with the
 *   reason mapping (ERROR/ABORTED/MAX_TOKENS/SUCCESS/UNKNOWN).
 * - Session disposal / flush closes started-but-unclosed requests as UNKNOWN.
 *
 * Everything is idempotent: duplicates for finalized keys are ignored, and
 * chunk events without an open request are dropped.
 */
export class RequestTracker {
  private readonly sessions = new Map<string, SessionState>();
  private readonly estimate: RequestTrackerOptions['estimate'];

  constructor(options: RequestTrackerOptions = {}) {
    this.estimate = options.estimate;
  }

  /** Feed one normalized event; returns the finalized UsageRecords (usually zero or one). */
  handle(normalized: NormalizedEvent): UsageRecord[] {
    switch (normalized.kind) {
      case 'request-context': {
        const state = this.session(normalized.sessionId);
        state.route = {
          provider: normalized.provider,
          model: normalized.model,
          contextWindow: normalized.contextWindow,
        };
        return [];
      }
      case 'step-start':
        return this.onStepStart(normalized);
      case 'chunk':
        return this.onChunk(normalized);
      case 'assistant-message':
        return this.onAssistantMessage(normalized);
      case 'step-end':
        return this.onStepEnd(normalized);
      case 'turn-end':
        return this.onTurnEnd(normalized);
    }
  }

  /**
   * Close every still-open started request of a session as UNKNOWN (session
   * disposal / plugin flush), discarding inactive steps, and drop the
   * session's tracking state.
   */
  closeSession(sessionId: string): UsageRecord[] {
    const state = this.sessions.get(sessionId);
    if (!state) return [];
    const records: UsageRecord[] = [];
    for (const active of [...state.active.values()].reverse()) {
      if (active.finalized) continue;
      active.finalized = true;
      if (!active.sawChunk) continue; // tool/empty step — discard
      records.push(
        this.finalize(state, active, {
          completedAt: Date.now(),
          status: 'UNKNOWN',
          usageSource: 'UNKNOWN',
        }),
      );
    }
    this.sessions.delete(sessionId);
    return records;
  }

  /** Close every still-open started request across all sessions as UNKNOWN (plugin flush). */
  closeAll(): UsageRecord[] {
    const records: UsageRecord[] = [];
    for (const sessionId of [...this.sessions.keys()]) {
      records.push(...this.closeSession(sessionId));
    }
    return records;
  }

  private session(sessionId: string): SessionState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { active: new Map() };
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  private onStepStart(n: Extract<NormalizedEvent, { kind: 'step-start' }>): UsageRecord[] {
    const state = this.session(n.sessionId);
    const key = stepKey(n.turn, n.step);
    const existing = state.active.get(key);
    if (existing && !existing.finalized) return []; // duplicate step/start — idempotent
    state.active.set(key, {
      key,
      sessionId: n.sessionId,
      turn: n.turn,
      step: n.step,
      startedAt: n.time,
      provider: state.route?.provider,
      model: state.route?.model,
      sawChunk: false,
      hasToolCalls: false,
      finalized: false,
    });
    return [];
  }

  private onChunk(n: Extract<NormalizedEvent, { kind: 'chunk' }>): UsageRecord[] {
    const state = this.session(n.sessionId);
    const active = state.active.get(stepKey(n.turn, n.step));
    if (!active || active.finalized) return [];
    active.sawChunk = true;
    const chunk: StreamChunkLike = n.chunk;
    switch (chunk.type) {
      case 'text-delta':
        if (active.firstTokenAt === undefined) active.firstTokenAt = n.time;
        break;
      case 'usage':
        // provisional: replace, never accumulate — final assistant/message usage supersedes it
        if (chunk.usage) active.provisionalUsage = chunk.usage;
        break;
      case 'finish':
        active.finishReason = chunk.reason?.kind;
        active.finishFailure = chunk.reason?.failure;
        break;
      case 'tool-call-delta':
        active.hasToolCalls = true;
        break;
      case 'block-end':
        if (chunk.block?.type === 'tool-call') active.hasToolCalls = true;
        break;
    }
    return [];
  }

  private onAssistantMessage(n: Extract<NormalizedEvent, { kind: 'assistant-message' }>): UsageRecord[] {
    const state = this.session(n.sessionId);
    const key = stepKey(n.turn, n.step);
    const active = state.active.get(key);
    if (!active || active.finalized) return []; // no open request / duplicate — idempotent
    active.finalized = true;
    active.sawChunk = true;
    active.provider = n.message.source?.provider ?? active.provider;
    active.model = n.message.source?.model ?? active.model;
    if (n.message.content?.some((block) => block.type === 'tool-call')) active.hasToolCalls = true;
    state.active.delete(key);

    const finishReason = active.finishReason;
    const { status, error } = statusFromFinish(finishReason, active.finishFailure);

    let usage: UsageBuckets | undefined;
    let usageSource: UsageSource = 'UNKNOWN';
    if (n.usage) {
      usage = tokenUsageToBuckets(n.usage);
      usageSource = 'PROVIDER';
    } else if (this.estimate) {
      const estimated = this.estimate(n.message);
      if (estimated) {
        usage = estimated;
        usageSource = 'ESTIMATED';
      }
    }

    return [
      this.finalize(state, active, {
        completedAt: n.time,
        seq: n.seq,
        status,
        error,
        usage,
        usageSource,
        ...(finishReason === undefined ? {} : { finishReason }),
      }),
    ];
  }

  private onStepEnd(n: Extract<NormalizedEvent, { kind: 'step-end' }>): UsageRecord[] {
    const state = this.session(n.sessionId);
    const key = stepKey(n.turn, n.step);
    const active = state.active.get(key);
    if (!active) return [];
    if (active.finalized) {
      // assistant/message already closed it — cleanup only
      state.active.delete(key);
      return [];
    }
    if (!active.sawChunk) {
      // tool/empty step: no LLM call happened — discard, no record
      state.active.delete(key);
      return [];
    }
    // Started stream without a message: keep open — `turn/end` carries the
    // authoritative outcome (error/abort/max-tokens are appended after step/end).
    return [];
  }

  private onTurnEnd(n: Extract<NormalizedEvent, { kind: 'turn-end' }>): UsageRecord[] {
    const state = this.session(n.sessionId);
    const closed: UsageRecord[] = [];
    for (const active of [...state.active.values()].reverse()) {
      if (active.turn !== n.turn || active.finalized) continue;
      active.finalized = true;
      state.active.delete(active.key);
      if (!active.sawChunk) continue; // tool/empty step — discard
      const { status, error } = statusFromTurnEnd(n.reason);
      closed.push(
        this.finalize(state, active, {
          completedAt: n.time,
          seq: n.seq,
          status,
          error,
          usageSource: 'UNKNOWN',
          finishReason: n.reason.kind,
        }),
      );
    }
    closed.sort((a, b) => a.step - b.step);
    return closed;
  }

  private finalize(
    state: SessionState,
    active: ActiveRequest,
    opts: {
      completedAt: number;
      seq?: number;
      status: RequestStatus;
      usage?: UsageBuckets;
      usageSource: UsageSource;
      finishReason?: string;
      error?: RequestErrorInfo;
    },
  ): UsageRecord {
    const record: UsageRecord = {
      sessionId: active.sessionId,
      turn: active.turn,
      step: active.step,
      startedAt: active.startedAt,
      completedAt: opts.completedAt,
      durationMs: Math.max(0, opts.completedAt - active.startedAt),
      provider: active.provider,
      model: active.model,
      contextWindow: state.route?.contextWindow,
      usageSource: opts.usageSource,
      status: opts.status,
      hasToolCalls: active.hasToolCalls,
    };
    if (opts.seq !== undefined) record.seq = opts.seq;
    if (opts.usage !== undefined) record.usage = opts.usage;
    if (opts.finishReason !== undefined) record.finishReason = opts.finishReason;
    if (opts.error !== undefined) record.error = opts.error;
    if (active.firstTokenAt !== undefined) {
      record.firstTokenAt = active.firstTokenAt;
      record.ttftMs = Math.max(0, active.firstTokenAt - active.startedAt);
    }
    return record;
  }
}
