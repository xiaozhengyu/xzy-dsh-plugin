import type { CSSProperties } from 'react';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { TimeRange } from '../query/types.js';

export type PresetKey = 'today' | '7d' | '30d';

export const PRESET_KEYS: PresetKey[] = ['today', '7d', '30d'];

const DAY_MS = 24 * 3_600_000;

export function presetLabel(key: PresetKey): string {
  if (key === 'today') return '今天';
  if (key === '30d') return '近 30 天';
  return '近 7 天';
}

export function presetRange(key: PresetKey): TimeRange {
  const now = Date.now();
  if (key === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.getTime(), to: now };
  }
  if (key === '30d') return { from: now - 30 * DAY_MS, to: now };
  return { from: now - 7 * DAY_MS, to: now };
}

export async function unwrap<T>(promise: Promise<RemoteResult<T>>): Promise<T> {
  const result = await promise;
  if (result.ok) return result.value;
  const error = result.error as { message?: string } | undefined;
  throw new Error(error?.message ?? 'usage-analytics remote call failed');
}

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function fmtPct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 本地时区短时间：MM-DD HH:mm。 */
export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 本地时区短日期：MM-DD（趋势图横轴）。 */
export function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 本地时区日期输入值：YYYY-MM-DD。 */
export function toLocalDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export const btnStyle = (active: boolean): CSSProperties => ({
  padding: '4px 10px',
  marginRight: 6,
  borderRadius: 6,
  border: '1px solid var(--theme-border, rgba(127,127,127,0.3))',
  background: active ? 'var(--theme-primary, rgba(120,160,255,0.25))' : 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
});

export const filterSelectStyle: CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--theme-border, rgba(127,127,127,0.3))',
  background: 'var(--theme-surface, rgba(127,127,127,0.08))',
  color: 'inherit',
  fontSize: 12,
  // 原生下拉弹出层默认白底；深色主题下显式声明 dark 使选项列表跟随深色。
  colorScheme: 'dark',
};

export const filterInputStyle: CSSProperties = {
  ...filterSelectStyle,
  minWidth: 180,
};
