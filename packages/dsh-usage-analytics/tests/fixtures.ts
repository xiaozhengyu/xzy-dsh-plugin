import type { SessionEvent } from '@deepseek-ai/dsh-session';

/** Build a fake SessionEvent; cast through unknown to keep fixtures plain. */
export function event(type: string, seq: number, time: number, data: unknown): SessionEvent {
  return { type, seq, time, data } as unknown as SessionEvent;
}
