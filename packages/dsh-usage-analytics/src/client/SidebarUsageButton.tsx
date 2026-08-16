/**
 * 侧栏底部按钮（sidebar.footer.action）：点击打开全屏用量弹窗。
 */
import React from 'react';
import { openUsageOverlay } from './overlay-store.js';

interface SidebarUsageButtonProps {
  wide?: boolean;
}

const triggerStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  cursor: 'pointer',
  width: 'calc(100% + 8px)',
  height: 34,
  color: 'var(--dsw-alias-label-primary)',
  background: 'transparent',
  border: 'none',
  borderRadius: 12,
  alignItems: 'center',
  gap: 8,
  margin: '4px -4px',
  padding: '6px 2px 6px 10px',
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: '22px',
  display: 'flex',
};

const railStyle: React.CSSProperties = {
  borderRadius: '50%',
  justifyContent: 'center',
  gap: 0,
  width: 36,
  height: 36,
  margin: '8px 0 10px',
  padding: 0,
};

function BarsIcon(): React.ReactElement {
  return React.createElement(
    'svg',
    { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': true },
    React.createElement('rect', { x: 2, y: 9, width: 3, height: 5, rx: 1 }),
    React.createElement('rect', { x: 6.5, y: 5, width: 3, height: 9, rx: 1 }),
    React.createElement('rect', { x: 11, y: 2, width: 3, height: 12, rx: 1 }),
  );
}

export function SidebarUsageButton(props: SidebarUsageButtonProps): React.ReactElement {
  const { wide } = props;
  return React.createElement(
    'button',
    {
      style: { ...triggerStyle, ...(wide ? {} : railStyle) },
      onClick: openUsageOverlay,
      title: '用量分析',
      type: 'button',
    },
    React.createElement(BarsIcon, null),
    wide ? React.createElement('span', null, '用量') : null,
  );
}
