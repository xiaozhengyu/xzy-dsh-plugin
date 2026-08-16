/**
 * 全屏用量弹窗（shell.overlay 槽位）。
 * 固定 Header（标题 / 副标题 / Tab / 关闭）+ 独立滚动 Body。
 */
import React from 'react';
import { OverviewPanel } from './OverviewPanel.js';
import { RequestHistory } from './RequestHistory.js';
import { isUsageOverlayOpen, setUsageOverlayOpen, subscribeUsageOverlay } from './overlay-store.js';
import { btnStyle } from './shared.js';
import { font, palette, radius, spacing } from './ui/tokens.js';
import type { UsageRemote } from './client-types.js';

interface UsageOverlayProps {
  usage: UsageRemote | undefined;
}

type TabKey = 'overview' | 'requests';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: '概览' },
  { key: 'requests', label: '请求历史' },
];

export function UsageOverlay(props: UsageOverlayProps): React.ReactElement | null {
  const { usage } = props;
  const open = React.useSyncExternalStore(subscribeUsageOverlay, isUsageOverlayOpen);
  const [tab, setTab] = React.useState<TabKey>('overview');

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setUsageOverlayOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return React.createElement(
    'div',
    {
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
      },
      role: 'dialog',
      'aria-modal': true,
      'aria-label': '用量分析',
    },
    React.createElement('div', {
      style: { position: 'absolute', inset: 0, background: palette.mask, backdropFilter: 'var(--dsw-mask-blur, blur(2px))' },
      onClick: () => setUsageOverlayOpen(false),
    }),
    React.createElement(
      'div',
      {
        style: {
          position: 'relative',
          zIndex: 1,
          width: 'min(1200px, calc(100vw - 64px))',
          height: 'min(900px, calc(100vh - 96px))',
          background: palette.surface,
          borderRadius: radius.xl,
          boxShadow: 'var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.35))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'inherit',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: spacing.md,
            padding: `${spacing.lg}px ${spacing.xl}px`,
            borderBottom: `1px solid ${palette.borderSubtle}`,
          },
        },
        React.createElement(
          'div',
          null,
          React.createElement('div', { style: { fontSize: font.pageTitle, fontWeight: 700, color: palette.labelPrimary } }, '用量分析'),
          React.createElement('div', { style: { fontSize: font.caption, color: palette.labelTertiary } }, '模型使用情况与性能'),
        ),
        React.createElement(
          'div',
          { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: spacing.xs } },
          TABS.map((t) =>
            React.createElement(
              'button',
              { key: t.key, style: btnStyle(tab === t.key), onClick: () => setTab(t.key), type: 'button' },
              t.label,
            ),
          ),
          React.createElement(
            'button',
            {
              style: {
                marginLeft: spacing.sm,
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                color: palette.labelPrimary,
                fontSize: 20,
                lineHeight: 1,
                width: 32,
                height: 32,
                borderRadius: radius.sm,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
              onClick: () => setUsageOverlayOpen(false),
              title: '关闭',
              type: 'button',
              'aria-label': '关闭',
            },
            '×',
          ),
        ),
      ),
      React.createElement(
        'div',
        { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: spacing.xl } },
        tab === 'overview'
          ? React.createElement(OverviewPanel, { usage })
          : React.createElement(RequestHistory, { usage }),
      ),
    ),
  );
}
