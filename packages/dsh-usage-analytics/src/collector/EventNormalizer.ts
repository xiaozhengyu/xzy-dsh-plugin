import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type {
  AssistantMessageLike,
  StreamChunkLike,
  TokenUsageLike,
  TurnEndReasonLike,
} from '../model/types.js';

/**
 * Plugin-internal event vocabulary. This module is the ONLY place that maps
 * raw `@deepseek-ai/dsh-session` event types onto DSH-agnostic shapes, so the
 * rest of the collector stays free of DSH type dependencies.
 */
export type NormalizedEvent =
  | {
      kind: 'step-start';
      sessionId: string;
      turn: number;
      step: number;
      time: number;
    }
  | {
      kind: 'chunk';
      sessionId: string;
      turn: number;
      step: number;
      time: number;
      chunk: StreamChunkLike;
    }
  | {
      kind: 'assistant-message';
      sessionId: string;
      turn: number;
      step: number;
      time: number;
      seq: number;
      message: AssistantMessageLike;
      usage?: TokenUsageLike;
    }
  | {
      kind: 'step-end';
      sessionId: string;
      turn: number;
      step: number;
      time: number;
      seq: number;
    }
  | {
      kind: 'turn-end';
      sessionId: string;
      turn: number;
      time: number;
      seq: number;
      reason: TurnEndReasonLike;
    }
  | {
      kind: 'request-context';
      sessionId: string;
      provider?: string;
      model?: string;
      contextWindow?: number;
    };

/**
 * Pure, throw-safe normalization of one durable session event.
 *
 * @param sessionId - the owning session's id (not carried by the event envelope).
 * @param event - one committed session event.
 * @returns the normalized event, or `null` for event types the collector does
 *   not consume (ignored; the runtime vocabulary is wider than this map).
 */
export function normalizeEvent(sessionId: string, event: SessionEvent): NormalizedEvent | null {
  switch (event.type) {
    case 'step/start':
      return {
        kind: 'step-start',
        sessionId,
        turn: event.data.turn,
        step: event.data.step,
        time: event.time,
      };
    case 'assistant/chunk':
      return {
        kind: 'chunk',
        sessionId,
        turn: event.data.turn,
        step: event.data.step,
        time: event.time,
        chunk: event.data.chunk as StreamChunkLike,
      };
    case 'assistant/message':
      return {
        kind: 'assistant-message',
        sessionId,
        turn: event.data.turn,
        step: event.data.step,
        time: event.time,
        seq: event.seq,
        message: event.data.message as AssistantMessageLike,
        usage: event.data.usage as TokenUsageLike | undefined,
      };
    case 'step/end':
      return {
        kind: 'step-end',
        sessionId,
        turn: event.data.turn,
        step: event.data.step,
        time: event.time,
        seq: event.seq,
      };
    case 'turn/end':
      return {
        kind: 'turn-end',
        sessionId,
        turn: event.data.turn,
        time: event.time,
        seq: event.seq,
        reason: event.data.reason as TurnEndReasonLike,
      };
    case 'request/context':
      return {
        kind: 'request-context',
        sessionId,
        provider: event.data.provider,
        model: event.data.model,
        contextWindow: event.data.contextWindow,
      };
    default:
      return null;
  }
}
