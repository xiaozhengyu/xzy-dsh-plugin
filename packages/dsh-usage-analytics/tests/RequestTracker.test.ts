import { describe, expect, it } from 'vitest';
import { RequestTracker } from '../src/collector/RequestTracker.js';
import type { NormalizedEvent } from '../src/collector/EventNormalizer.js';
import type { UsageBuckets } from '../src/model/types.js';

function tracker(estimate?: (message: unknown) => UsageBuckets | undefined) {
  return new RequestTracker({ estimate });
}

const stepStart = (turn: number, step: number, time: number): NormalizedEvent => ({
  kind: 'step-start',
  sessionId: 's1',
  turn,
  step,
  time,
});
const chunk = (turn: number, step: number, time: number, c: unknown): NormalizedEvent => ({
  kind: 'chunk',
  sessionId: 's1',
  turn,
  step,
  time,
  chunk: c as never,
});
const message = (
  turn: number,
  step: number,
  time: number,
  seq: number,
  msg: unknown,
  usage?: unknown,
): NormalizedEvent => ({
  kind: 'assistant-message',
  sessionId: 's1',
  turn,
  step,
  time,
  seq,
  message: msg as never,
  usage: usage as never,
});
const stepEnd = (turn: number, step: number, time: number, seq: number): NormalizedEvent => ({
  kind: 'step-end',
  sessionId: 's1',
  turn,
  step,
  time,
  seq,
});
const turnEnd = (turn: number, time: number, seq: number, reason: unknown): NormalizedEvent => ({
  kind: 'turn-end',
  sessionId: 's1',
  turn,
  time,
  seq,
  reason: reason as never,
});
const routeCtx = (provider: string, model: string, contextWindow?: number): NormalizedEvent => ({
  kind: 'request-context',
  sessionId: 's1',
  provider,
  model,
  contextWindow,
});

const src = (provider: string, model: string) => ({ source: { kind: 'model', provider, model }, content: [] });

describe('RequestTracker', () => {
  it('finalizes a full lifecycle with PROVIDER usage, disjoint totals, duration and ttft', () => {
    const t = tracker();
    t.handle(routeCtx('deepseek', 'deepseek-v4', 128000));
    t.handle(stepStart(1, 0, 1000));
    t.handle(chunk(1, 0, 1100, { type: 'text-delta', index: 0, text: 'a' }));
    t.handle(chunk(1, 0, 1200, { type: 'usage', usage: { inputTokens: 100, cacheReadTokens: 50, outputTokens: 30 } }));
    t.handle(chunk(1, 0, 1300, { type: 'finish', reason: { kind: 'stop' } }));
    const records = t.handle(
      message(
        1,
        0,
        1400,
        20,
        { source: { kind: 'model', provider: 'deepseek', model: 'deepseek-v4' }, content: [{ type: 'text', text: 'a' }] },
        { inputTokens: 100, cacheReadTokens: 50, outputTokens: 30 },
      ),
    );

    expect(records).toHaveLength(1);
    const r = records[0]!;
    expect(r).toMatchObject({
      sessionId: 's1',
      turn: 1,
      step: 0,
      seq: 20,
      startedAt: 1000,
      completedAt: 1400,
      durationMs: 400,
      provider: 'deepseek',
      model: 'deepseek-v4',
      contextWindow: 128000,
      usageSource: 'PROVIDER',
      status: 'SUCCESS',
      finishReason: 'stop',
      hasToolCalls: false,
      firstTokenAt: 1100,
      ttftMs: 100,
    });
    expect(r.usage).toEqual({
      inputTokens: 100,
      cacheReadTokens: 50,
      cacheWriteTokens: 0,
      outputTokens: 30,
      totalTokens: 180,
    });
    expect(r.error).toBeUndefined();
  });

  it('replaces provisional chunk usage with final message usage (never accumulates)', () => {
    const t = tracker();
    t.handle(stepStart(1, 0, 1000));
    t.handle(chunk(1, 0, 1100, { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } }));
    t.handle(chunk(1, 0, 1150, { type: 'usage', usage: { inputTokens: 99, outputTokens: 9 } }));
    const records = t.handle(
      message(1, 0, 1200, 15, src('p', 'm'), { inputTokens: 100, outputTokens: 10 }),
    );
    expect(records[0]!.usage!.totalTokens).toBe(110); // 100 + 0 + 0 + 10, not 10+99+...
  });

  it('is idempotent: duplicate assistant/message yields one record', () => {
    const t = tracker();
    t.handle(stepStart(1, 0, 1000));
    const first = t.handle(message(1, 0, 1200, 15, src('p', 'm'), { inputTokens: 10, outputTokens: 1 }));
    const second = t.handle(message(1, 0, 1200, 15, src('p', 'm'), { inputTokens: 999, outputTokens: 999 }));
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('is idempotent: duplicate step/start keeps the original startedAt', () => {
    const t = tracker();
    t.handle(stepStart(1, 0, 1000));
    t.handle(stepStart(1, 0, 1000)); // duplicate — ignored
    const records = t.handle(message(1, 0, 1200, 15, src('p', 'm'), { inputTokens: 1, outputTokens: 1 }));
    expect(records).toHaveLength(1);
    expect(records[0]!.startedAt).toBe(1000);
  });

  it('records ERROR at turn/end with LlmFailure facts (step/end precedes turn/end)', () => {
    const t = tracker();
    t.handle(routeCtx('p', 'm'));
    t.handle(stepStart(1, 0, 1000));
    t.handle(chunk(1, 0, 1050, { type: 'text-delta', index: 0, text: 'x' }));
    // a failed request closes at turn/end; step/end must not have closed it as UNKNOWN
    t.handle(stepEnd(1, 0, 1100, 12));
    const records = t.handle(
      turnEnd(1, 2000, 30, { kind: 'error', error: { message: 'upstream 429', code: 'RATE_LIMITED', requestId: 'req-1' } }),
    );
    expect(records).toHaveLength(1);
    const r = records[0]!;
    expect(r).toMatchObject({
      turn: 1,
      step: 0,
      status: 'ERROR',
      usageSource: 'UNKNOWN',
      completedAt: 2000,
      provider: 'p',
      model: 'm',
      finishReason: 'error',
    });
    expect(r.error).toEqual({ code: 'RATE_LIMITED', message: 'upstream 429', requestId: 'req-1' });
    expect(r.usage).toBeUndefined();
  });

  it('records ABORTED at turn/end for a started request', () => {
    const t = tracker();
    t.handle(stepStart(1, 0, 1000));
    t.handle(chunk(1, 0, 1050, { type: 'text-delta', index: 0, text: 'x' }));
    const records = t.handle(turnEnd(1, 1500, 10, { kind: 'aborted', reason: { kind: 'user' } }));
    expect(records).toHaveLength(1);
    expect(records[0]!.status).toBe('ABORTED');
    expect(records[0]!.finishReason).toBe('aborted');
  });

  it('records MAX_TOKENS from a finish chunk even when a message assembles', () => {
    const t = tracker();
    t.handle(stepStart(1, 0, 1000));
    t.handle(chunk(1, 0, 1100, { type: 'finish', reason: { kind: 'max-tokens' } }));
    const records = t.handle(
      message(1, 0, 1200, 15, src('p', 'm'), { inputTokens: 10, outputTokens: 30 }),
    );
    expect(records[0]!.status).toBe('MAX_TOKENS');
  });

  it('tool-calls finish is SUCCESS, not failure', () => {
    const t = tracker();
    t.handle(stepStart(1, 0, 1000));
    t.handle(chunk(1, 0, 1100, { type: 'tool-call-delta', index: 0, id: 'c1', name: 'bash', argumentsDelta: '{}' }));
    t.handle(chunk(1, 0, 1150, { type: 'finish', reason: { kind: 'tool-calls' } }));
    const records = t.handle(
      message(1, 0, 1200, 15, {
        source: { kind: 'model', provider: 'p', model: 'm' },
        content: [{ type: 'tool-call', id: 'c1', name: 'bash', arguments: '{}' }],
      }),
    );
    expect(records[0]!.status).toBe('SUCCESS');
    expect(records[0]!.hasToolCalls).toBe(true);
  });

  it('discards tool/empty steps (no chunks, no message) — no record', () => {
    const t = tracker();
    t.handle(stepStart(1, 0, 1000)); // tool step: no assistant/chunk at all
    expect(t.handle(stepEnd(1, 0, 1200, 12))).toHaveLength(0);
    // and no record at turn/end either
    expect(t.handle(turnEnd(1, 1300, 13, { kind: 'completed' }))).toHaveLength(0);
  });

  it('closes a started-but-unclosed request at turn/end as UNKNOWN when reason is unknown-ish', () => {
    const t = tracker();
    t.handle(stepStart(1, 0, 1000));
    t.handle(chunk(1, 0, 1100, { type: 'text-delta', index: 0, text: 'x' }));
    const records = t.handle(turnEnd(1, 1500, 10, { kind: 'interrupted' }));
    expect(records[0]!.status).toBe('UNKNOWN');
  });

  it('step/end after a message is cleanup only (no second record)', () => {
    const t = tracker();
    t.handle(stepStart(1, 0, 1000));
    const first = t.handle(message(1, 0, 1200, 15, src('p', 'm'), { inputTokens: 1, outputTokens: 1 }));
    const second = t.handle(stepEnd(1, 0, 1300, 16));
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('ignores chunks and messages without an open request', () => {
    const t = tracker();
    expect(t.handle(chunk(1, 0, 1100, { type: 'text-delta', index: 0, text: 'x' }))).toHaveLength(0);
    expect(t.handle(message(1, 0, 1200, 15, src('p', 'm'), { inputTokens: 1, outputTokens: 1 }))).toHaveLength(0);
  });

  it('uses the estimate hook for ESTIMATED usage', () => {
    const t = tracker(() => ({
      inputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 3,
      totalTokens: 8,
    }));
    t.handle(stepStart(1, 0, 1000));
    const records = t.handle(message(1, 0, 1200, 15, src('p', 'm')));
    expect(records[0]!.usageSource).toBe('ESTIMATED');
    expect(records[0]!.usage!.totalTokens).toBe(8);
  });

  it('closeSession closes started open requests as UNKNOWN and discards inactive steps', () => {
    const t = tracker();
    t.handle(stepStart(1, 0, 1000)); // started stream, never closed
    t.handle(chunk(1, 0, 1050, { type: 'text-delta', index: 0, text: 'x' }));
    t.handle(stepStart(2, 0, 2000)); // tool step, no chunks
    const records = t.closeSession('s1');
    expect(records).toHaveLength(1);
    expect(records[0]!).toMatchObject({ turn: 1, step: 0, status: 'UNKNOWN' });
    expect(records[0]!.seq).toBeUndefined();
  });
});
