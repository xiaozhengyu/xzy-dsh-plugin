import React from 'react';
import type { RequestStatus } from '../../model/types.js';
import { font, palette } from './tokens.js';

export type BadgeTone = 'success' | 'error' | 'warn' | 'info' | 'neutral';

const TONE_COLOR: Record<BadgeTone, string> = {
  success: palette.success,
  error: palette.error,
  warn: palette.warn,
  info: palette.primary,
  neutral: palette.labelTertiary,
};

export function Badge(props: { label: string; tone: BadgeTone }): React.ReactElement {
  const { label, tone } = props;
  return React.createElement(
    'span',
    { style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.label, color: palette.labelSecondary, whiteSpace: 'nowrap' } },
    React.createElement('span', { style: { width: 8, height: 8, borderRadius: '50%', background: TONE_COLOR[tone], display: 'inline-block' } }),
    label,
  );
}

/** 请求状态 → 中文文案 + 语义色调。 */
export function statusBadge(status: string): React.ReactElement {
  const map: Record<string, { label: string; tone: BadgeTone }> = {
    SUCCESS: { label: '成功', tone: 'success' },
    ERROR: { label: '错误', tone: 'error' },
    ABORTED: { label: '中断', tone: 'warn' },
    MAX_TOKENS: { label: '达到上限', tone: 'warn' },
    UNKNOWN: { label: '未知', tone: 'neutral' },
  };
  const entry = map[status as RequestStatus];
  return entry ? React.createElement(Badge, { label: entry.label, tone: entry.tone }) : React.createElement(Badge, { label: status, tone: 'neutral' });
}
