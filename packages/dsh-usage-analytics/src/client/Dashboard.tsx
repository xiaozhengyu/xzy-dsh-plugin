/**
 * 用量分析 —— settings.section 入口。
 * 页面内 Tab 结构：概览 / 请求历史。
 */
import React from 'react';
import { OverviewPanel } from './OverviewPanel.js';
import { RequestHistory } from './RequestHistory.js';
import { btnStyle } from './shared.js';
import type { UsageRemote } from './client-types.js';

export interface DashboardProps {
  usage: UsageRemote | undefined;
  /** 传入时在标题栏右侧显示关闭按钮（全屏弹窗模式）。 */
  onClose?: () => void;
}

type TabKey = 'overview' | 'requests';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: '概览' },
  { key: 'requests', label: '请求历史' },
];

export function Dashboard(props: DashboardProps): React.ReactElement {
  const { usage, onClose } = props;
  const [tab, setTab] = React.useState<TabKey>('overview');

  return React.createElement(
    'div',
    { style: { fontFamily: 'inherit', padding: '4px 2px' } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 } },
      React.createElement('span', { style: { fontSize: 16, fontWeight: 700 } }, '用量分析'),
      React.createElement(
        'div',
        { style: { marginLeft: 'auto', display: 'flex' } },
        TABS.map((t) =>
          React.createElement(
            'button',
            { key: t.key, style: btnStyle(tab === t.key), onClick: () => setTab(t.key) },
            t.label,
          ),
        ),
        onClose
          ? React.createElement(
              'button',
              {
                style: { ...btnStyle(false), marginLeft: 12, fontSize: 16, lineHeight: 1 },
                onClick: onClose,
                title: '关闭',
                type: 'button',
              },
              '×',
            )
          : null,
      ),
    ),
    tab === 'overview'
      ? React.createElement(OverviewPanel, { usage })
      : React.createElement(RequestHistory, { usage }),
  );
}
