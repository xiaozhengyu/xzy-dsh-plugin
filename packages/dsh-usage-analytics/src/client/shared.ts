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

export function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(5, 16).replace('T', ' ');
}

export const cardStyle: CSSProperties = {
  background: 'var(--theme-surface, rgba(127,127,127,0.08))',
  borderRadius: 8,
  padding: '12px 16px',
  minWidth: 130,
};
export const labelStyle: CSSProperties = { fontSize: 12, opacity: 0.65, marginBottom: 4 };
export const valueStyle: CSSProperties = { fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums' };
export const sectionTitleStyle: CSSProperties = { fontSize: 14, fontWeight: 600, margin: '20px 0 8px' };
export const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};
export const tableWrapStyle: CSSProperties = {
  overflowX: 'auto',
};
export const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  opacity: 0.6,
  borderBottom: '1px solid var(--theme-border, rgba(127,127,127,0.25))',
};
export const tdStyle: CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--theme-border, rgba(127,127,127,0.15))',
};
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
};

export const filterInputStyle: CSSProperties = {
  ...filterSelectStyle,
  minWidth: 180,
};
