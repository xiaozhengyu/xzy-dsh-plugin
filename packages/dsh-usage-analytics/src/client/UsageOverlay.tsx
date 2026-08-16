/**
 * 全屏用量弹窗（shell.overlay 槽位）。
 * 打开时渲染遮罩 + 大面板，内部复用 Dashboard 的 概览 / 请求历史 Tab。
 */
import React from 'react';
import { Dashboard } from './Dashboard.js';
import { isUsageOverlayOpen, setUsageOverlayOpen, subscribeUsageOverlay } from './overlay-store.js';
import type { UsageRemote } from './client-types.js';

interface UsageOverlayProps {
  usage: UsageRemote | undefined;
}

const rootStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'auto',
};

const maskStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.45)',
  backdropFilter: 'var(--dsw-mask-blur, blur(2px))',
};

const panelStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  width: 'min(1200px, calc(100vw - 64px))',
  height: 'min(900px, calc(100vh - 96px))',
  background: 'var(--dsw-alias-bg-layer-2, var(--theme-surface, #1e1f24))',
  borderRadius: 16,
  boxShadow: 'var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.35))',
  padding: '16px 20px 20px',
  overflowY: 'auto',
  fontFamily: 'inherit',
};

const closeStyle: React.CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 20,
  lineHeight: 1,
  width: 32,
  height: 32,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function UsageOverlay(props: UsageOverlayProps): React.ReactElement | null {
  const { usage } = props;
  const open = React.useSyncExternalStore(subscribeUsageOverlay, isUsageOverlayOpen);

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
    { style: rootStyle, role: 'dialog', 'aria-modal': true, 'aria-label': '用量分析' },
    React.createElement('div', { style: maskStyle, onClick: () => setUsageOverlayOpen(false) }),
    React.createElement(
      'div',
      { style: panelStyle },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end' } },
        React.createElement(
          'button',
          { style: closeStyle, onClick: () => setUsageOverlayOpen(false), title: '关闭', type: 'button', 'aria-label': '关闭' },
          '×',
        ),
      ),
      React.createElement(Dashboard, { usage }),
    ),
  );
}
