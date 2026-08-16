import { describe, expect, it } from 'vitest';
import { normalizeEvent } from '../src/collector/EventNormalizer.js';
import { event } from './fixtures.js';

describe('EventNormalizer', () => {
  it('normalizes step/start', () => {
    const e = event('step/start', 10, 1000, { turn: 1, step: 2 });
    expect(normalizeEvent('s1', e)).toEqual({
      kind: 'step-start',
      sessionId: 's1',
      turn: 1,
      step: 2,
      time: 1000,
    });
  });

  it('passes assistant/chunk through', () => {
    const chunk = { type: 'text-delta', index: 0, text: 'hi' };
    const e = event('assistant/chunk', 11, 1100, { turn: 1, step: 2, chunk });
    expect(normalizeEvent('s1', e)).toEqual({
      kind: 'chunk',
      sessionId: 's1',
      turn: 1,
      step: 2,
      time: 1100,
      chunk,
    });
  });

  it('normalizes assistant/message with usage', () => {
    const message = {
      role: 'assistant',
      id: 'm1',
      source: { kind: 'model', provider: 'deepseek', model: 'deepseek-v4' },
      content: [],
    };
    const usage = { inputTokens: 10, outputTokens: 5 };
    const e = event('assistant/message', 12, 1200, { turn: 1, step: 2, message, usage });
    expect(normalizeEvent('s1', e)).toEqual({
      kind: 'assistant-message',
      sessionId: 's1',
      turn: 1,
      step: 2,
      time: 1200,
      seq: 12,
      message,
      usage,
    });
  });

  it('normalizes assistant/message without usage', () => {
    const e = event('assistant/message', 12, 1200, {
      turn: 1,
      step: 2,
      message: { source: { provider: 'p', model: 'm' }, content: [] },
    });
    const n = normalizeEvent('s1', e);
    expect(n).toMatchObject({ kind: 'assistant-message', usage: undefined });
  });

  it('normalizes turn/end error reason', () => {
    const reason = { kind: 'error', error: { message: 'boom', code: 'RATE_LIMITED' } };
    const e = event('turn/end', 13, 1300, { turn: 1, reason });
    expect(normalizeEvent('s1', e)).toEqual({
      kind: 'turn-end',
      sessionId: 's1',
      turn: 1,
      time: 1300,
      seq: 13,
      reason,
    });
  });

  it('normalizes request/context', () => {
    const e = event('request/context', 5, 900, {
      provider: 'deepseek',
      model: 'deepseek-v4',
      contextWindow: 128000,
    });
    expect(normalizeEvent('s1', e)).toEqual({
      kind: 'request-context',
      sessionId: 's1',
      provider: 'deepseek',
      model: 'deepseek-v4',
      contextWindow: 128000,
    });
  });

  it('returns null for unknown event types', () => {
    expect(normalizeEvent('s1', event('user/message', 6, 950, {}))).toBeNull();
    expect(normalizeEvent('s1', event('tool/call', 7, 960, { turn: 1, step: 0 }))).toBeNull();
  });
});
