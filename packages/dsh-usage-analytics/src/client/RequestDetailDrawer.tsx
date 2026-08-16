/**
 * 请求详情抽屉：点击请求历史中的行打开，展示单次请求的完整字段。
 * 这里按设计恢复 缓存读 / 缓存写 拆分（明细语境，不同于列表的合并列）。
 */
import React from 'react';
import type { UsageRecordRow } from '../storage/UsageRepository.js';
import { fmt, fmtMs, fmtTime } from './shared.js';
import { statusBadge } from './ui/Badge.js';
import { font, palette, radius, spacing } from './ui/tokens.js';

interface RequestDetailDrawerProps {
  row: UsageRecordRow | null;
  onClose: () => void;
}

export function RequestDetailDrawer(props: RequestDetailDrawerProps): React.ReactElement | null {
  const { row, onClose } = props;

  React.useEffect(() => {
    if (!row) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, onClose]);

  if (!row) return null;

  const sessionId = row.sessionId.length > 18 ? `${row.sessionId.slice(0, 8)}…${row.sessionId.slice(-6)}` : row.sessionId;
  const usageSource = row.usageSource === 'PROVIDER' ? 'Provider' : row.usageSource === 'ESTIMATED' ? '估算' : '未知';

  return React.createElement(
    'div',
    { style: { position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'auto', background: 'rgba(0,0,0,0.2)' }, onClick: onClose },
    React.createElement(
      'div',
      {
        style: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(400px, 90vw)',
          background: palette.surface,
          borderLeft: `1px solid ${palette.border}`,
          boxShadow: 'var(--dsw-shadow-lv3, -8px 0 24px rgba(0,0,0,0.25))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
      },
      React.createElement(
        'div',
        { style: { flex: 'none', display: 'flex', alignItems: 'center', gap: spacing.md, padding: `${spacing.lg}px ${spacing.xl}px`, borderBottom: `1px solid ${palette.borderSubtle}` } },
        React.createElement('div', { style: { fontSize: font.cardTitle, fontWeight: 600, color: palette.labelPrimary } }, '请求详情'),
        React.createElement(
          'button',
          {
            style: { marginLeft: 'auto', cursor: 'pointer', border: 'none', background: 'transparent', color: palette.labelPrimary, fontSize: 20, lineHeight: 1, width: 28, height: 28, borderRadius: radius.sm },
            onClick: onClose,
            title: '关闭',
            type: 'button',
            'aria-label': '关闭',
          },
          '×',
        ),
      ),
      React.createElement(
        'div',
        { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: spacing.xl } },
        detailBlock('Provider', row.provider ?? '—'),
        detailBlock('Model', row.model ?? '—'),
        React.createElement(
          'div',
          null,
          React.createElement('div', { style: blockTitleStyle }, 'Token 用量'),
          detailRow('输入', fmt(row.inputTokens)),
          detailRow('缓存读', fmt(row.cacheReadTokens)),
          detailRow('缓存写', fmt(row.cacheWriteTokens)),
          detailRow('输出', fmt(row.outputTokens)),
          detailRow('总量', fmt(row.totalTokens)),
        ),
        React.createElement(
          'div',
          null,
          React.createElement('div', { style: blockTitleStyle }, '性能'),
          detailRow('耗时', fmtMs(row.durationMs)),
          detailRow('TTFT', fmtMs(row.ttftMs)),
        ),
        React.createElement(
          'div',
          null,
          React.createElement('div', { style: blockTitleStyle }, '状态'),
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.sm}px 0`, fontSize: font.body } },
            React.createElement('span', { style: { color: palette.labelSecondary } }, '状态'),
            statusBadge(row.status),
          ),
          detailRow('完成原因', row.finishReason ?? '—'),
          detailRow('用量来源', usageSource),
        ),
        React.createElement(
          'div',
          null,
          React.createElement('div', { style: blockTitleStyle }, '上下文'),
          detailRow('会话', sessionId),
          detailRow('Turn/Step', `${row.turn}/${row.step}`),
          detailRow('上下文窗口', row.contextWindow !== null ? fmt(row.contextWindow) : '—'),
          detailRow('开始时间', fmtTime(row.startedAt)),
          detailRow('完成时间', fmtTime(row.completedAt)),
        ),
        row.errorCode !== null || row.errorMessage !== null
          ? React.createElement(
              'div',
              null,
              React.createElement('div', { style: blockTitleStyle }, '错误'),
              detailRow('错误码', row.errorCode ?? '—'),
              detailRow('错误信息', row.errorMessage ?? '—'),
            )
          : null,
      ),
    ),
  );
}

const blockTitleStyle: React.CSSProperties = {
  fontSize: font.label,
  fontWeight: 600,
  color: palette.labelTertiary,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  margin: `${spacing.lg}px 0 ${spacing.sm}px`,
};

function detailBlock(label: string, value: string): React.ReactElement {
  return React.createElement(
    'div',
    { style: { marginBottom: spacing.sm } },
    React.createElement('div', { style: blockTitleStyle }, label),
    React.createElement('div', { style: { fontSize: font.body, color: palette.labelPrimary } }, value),
  );
}

function detailRow(label: string, value: string): React.ReactElement {
  return React.createElement(
    'div',
    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, padding: `${spacing.sm}px 0`, borderBottom: `1px solid ${palette.borderSubtle}`, fontSize: font.body } },
    React.createElement('span', { style: { color: palette.labelSecondary } }, label),
    React.createElement('span', { style: { color: palette.labelPrimary, fontVariantNumeric: 'tabular-nums', textAlign: 'right', overflowWrap: 'anywhere' } }, value),
  );
}
