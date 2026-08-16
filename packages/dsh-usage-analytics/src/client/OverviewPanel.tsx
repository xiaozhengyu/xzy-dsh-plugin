/**
 * 用量分析 —— 概览 Tab。
 * 指标卡片 + 每日趋势 + Provider / Model 分布 + 最近请求 + 会话排行。
 */
import React from 'react';
import type {
  ModelStats,
  OverviewMetrics,
  ProviderStats,
  RequestQuery,
  SessionStats,
  TrendBucket,
} from '../query/types.js';
import type { UsageRecordRow } from '../storage/UsageRepository.js';
import type { UsageRemote } from './client-types.js';
import {
  btnStyle,
  cardStyle,
  fmt,
  fmtDate,
  fmtMs,
  fmtPct,
  labelStyle,
  PRESET_KEYS,
  presetLabel,
  presetRange,
  sectionTitleStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  unwrap,
  valueStyle,
  type PresetKey,
} from './shared.js';

interface OverviewPanelProps {
  usage: UsageRemote | undefined;
}

interface OverviewData {
  overview: OverviewMetrics;
  trend: TrendBucket[];
  providers: ProviderStats[];
  models: ModelStats[];
  requests: UsageRecordRow[];
  sessions: SessionStats[];
}

export function OverviewPanel(props: OverviewPanelProps): React.ReactElement {
  const { usage } = props;
  const [preset, setPreset] = React.useState<PresetKey>('7d');
  const [data, setData] = React.useState<OverviewData | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!usage) {
      setError('用量分析服务不可用，请检查插件加载状态。');
      setData(null);
      return;
    }
    const range = presetRange(preset);
    let cancelled = false;
    setError(null);
    setData(null);
    void (async () => {
      try {
        const [overview, trend, providers, models, requestPage, sessions] = await Promise.all([
          unwrap(usage.getOverview(range)),
          unwrap(usage.getTrend(range, 'day')),
          unwrap(usage.getProviderStats(range)),
          unwrap(usage.getModelStats(range)),
          unwrap(usage.listRequests({ ...range, limit: 10 } as RequestQuery)),
          unwrap(usage.listSessions(range)),
        ]);
        if (cancelled) return;
        setData({ overview, trend, providers, models, requests: requestPage.items, sessions });
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usage, preset]);

  const maxTrend = data ? Math.max(1, ...data.trend.map((b) => b.totalTokens)) : 1;

  return React.createElement(
    'div',
    null,
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
      React.createElement(
        'div',
        { style: { marginLeft: 'auto' } },
        PRESET_KEYS.map((key) =>
          React.createElement(
            'button',
            { key: key, style: btnStyle(preset === key), onClick: () => setPreset(key) },
            presetLabel(key),
          ),
        ),
      ),
    ),
    error !== null
      ? React.createElement('div', { style: { color: 'var(--theme-danger, #e5534b)' } }, `加载失败：${error}`)
      : data === null
        ? React.createElement('div', { style: { opacity: 0.6 } }, '加载中…')
        : React.createElement(
            React.Fragment,
            null,
            React.createElement(
              'div',
              { style: { display: 'flex', flexWrap: 'wrap', gap: 10 } },
              card('请求数', String(data.overview.requestCount)),
              card('总 Tokens', fmt(data.overview.totalTokens)),
              card('输入', fmt(data.overview.inputTokens)),
              card('缓存', fmt(data.overview.cachedInputTokens)),
              card('输出', fmt(data.overview.outputTokens)),
              card('成功率', fmtPct(data.overview.successRate)),
              card('缓存命中', fmtPct(data.overview.cacheHitRate)),
              card('平均耗时', fmtMs(data.overview.avgDurationMs)),
              card('P95', fmtMs(data.overview.p95DurationMs)),
              card('Tokens/请求', fmt(data.overview.tokensPerRequest)),
            ),
            React.createElement('div', { style: sectionTitleStyle }, '每日 Token 趋势'),
            React.createElement(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
              data.trend.slice(-14).map((bucket) =>
                React.createElement(
                  'div',
                  { key: bucket.bucketStart, style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  React.createElement('span', { style: { width: 90, fontSize: 12, opacity: 0.7 } }, fmtDate(bucket.bucketStart)),
                  React.createElement('div', {
                    style: {
                      height: 10,
                      width: `${Math.max(2, (bucket.totalTokens / maxTrend) * 100)}%`,
                      background: 'var(--theme-primary, rgba(120,160,255,0.7))',
                      borderRadius: 3,
                    },
                  }),
                  React.createElement('span', { style: { fontSize: 12, fontVariantNumeric: 'tabular-nums' } }, fmt(bucket.totalTokens)),
                ),
              ),
            ),
            React.createElement('div', { style: sectionTitleStyle }, 'Provider 分布'),
            statsTable(
              data.providers.map((p) => [p.provider, String(p.requestCount), fmt(p.totalTokens), fmtPct(p.successRate)]),
            ),
            React.createElement('div', { style: sectionTitleStyle }, 'Model 分布'),
            statsTable(
              data.models.map((m) => [m.model, String(m.requestCount), fmt(m.totalTokens), fmtPct(m.successRate)]),
            ),
            React.createElement('div', { style: sectionTitleStyle }, '最近请求'),
            React.createElement(
              'div',
              { style: tableWrapStyle },
              React.createElement(
                'table',
                { style: tableStyle },
                React.createElement(
                  'thead',
                  null,
                  React.createElement(
                    'tr',
                    null,
                    ['时间', 'Provider', 'Model', '输入', '缓存', '输出', '总量', '状态', '耗时'].map((h) =>
                      React.createElement('th', { key: h, style: thStyle }, h),
                    ),
                  ),
                ),
                React.createElement(
                  'tbody',
                  null,
                  data.requests.map((r) =>
                    React.createElement(
                      'tr',
                      { key: r.id },
                      React.createElement('td', { style: tdStyle }, fmtDate(r.startedAt)),
                      React.createElement('td', { style: tdStyle }, r.provider ?? '—'),
                      React.createElement('td', { style: tdStyle }, r.model ?? '—'),
                      React.createElement('td', { style: tdStyle }, fmt(r.inputTokens)),
                      React.createElement('td', { style: tdStyle }, fmt((r.cacheReadTokens ?? 0) + (r.cacheWriteTokens ?? 0))),
                      React.createElement('td', { style: tdStyle }, fmt(r.outputTokens)),
                      React.createElement('td', { style: tdStyle }, fmt(r.totalTokens)),
                      React.createElement('td', { style: tdStyle }, statusLabel(r.status)),
                      React.createElement('td', { style: tdStyle }, fmtMs(r.durationMs)),
                    ),
                  ),
                ),
              ),
            ),
            React.createElement('div', { style: sectionTitleStyle }, '会话排行（按 Token）'),
            statsTable(
              data.sessions.slice(0, 5).map((s) => [shortId(s), String(s.requestCount), fmt(s.totalTokens), fmtPct(s.successRate)]),
            ),
          ),
  );
}

function shortId(session: SessionStats): string {
  return session.sessionId.length > 18 ? `${session.sessionId.slice(0, 8)}…${session.sessionId.slice(-6)}` : session.sessionId;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    SUCCESS: '成功',
    ERROR: '错误',
    ABORTED: '中断',
    MAX_TOKENS: '达到上限',
    UNKNOWN: '未知',
  };
  return labels[status] ?? status;
}

function card(label: string, value: string): React.ReactElement {
  return React.createElement(
    'div',
    { style: cardStyle },
    React.createElement('div', { style: labelStyle }, label),
    React.createElement('div', { style: valueStyle }, value),
  );
}

function statsTable(rows: Array<Array<string>>): React.ReactElement {
  return React.createElement(
    'table',
    { style: tableStyle },
    React.createElement(
      'tbody',
      null,
      rows.map((cells, i) =>
        React.createElement(
          'tr',
          { key: i },
          cells.map((cell, j) => React.createElement('td', { key: j, style: tdStyle }, cell)),
        ),
      ),
    ),
  );
}
