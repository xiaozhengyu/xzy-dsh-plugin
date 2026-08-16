/**
 * 用量分析 —— 概览 Tab（UI 2.0）。
 * 信息层级：核心 KPI → Token 用量 / 性能 → 趋势 → Provider / Model → 最近请求 / 会话排行。
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
  filterInputStyle,
  fmt,
  fmtDay,
  fmtMs,
  fmtPct,
  fmtTime,
  PRESET_KEYS,
  presetLabel,
  presetRange,
  toLocalDateInput,
  unwrap,
  type PresetKey,
} from './shared.js';
import { Card, ChartSkeleton, EmptyState, KpiSkeleton, ListSkeleton, Section, StatCard, statusBadge } from './ui/index.js';
import { font, palette, radius, spacing } from './ui/tokens.js';

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

type RangePreset = PresetKey | 'custom';
type TrendMetric = 'tokens' | 'requests';

const DAY_MS = 24 * 3_600_000;

export function OverviewPanel(props: OverviewPanelProps): React.ReactElement {
  const { usage } = props;
  const [preset, setPreset] = React.useState<RangePreset>('7d');
  const [customFrom, setCustomFrom] = React.useState('');
  const [customTo, setCustomTo] = React.useState('');
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [reload, setReload] = React.useState(0);
  const [data, setData] = React.useState<OverviewData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<number | null>(null);
  const [trendMetric, setTrendMetric] = React.useState<TrendMetric>('tokens');
  const hasDataRef = React.useRef(false);
  hasDataRef.current = data !== null;

  const range = React.useMemo(() => {
    if (preset !== 'custom') return presetRange(preset);
    const from = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : Number.NaN;
    const to = customTo ? new Date(`${customTo}T00:00:00`).getTime() + DAY_MS : Number.NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return null;
    return { from, to };
  }, [preset, customFrom, customTo]);

  const selectPreset = (key: RangePreset): void => {
    if (key === 'custom' && customFrom === '' && customTo === '') {
      const to = new Date();
      setCustomFrom(toLocalDateInput(to.getTime() - 30 * DAY_MS));
      setCustomTo(toLocalDateInput(to.getTime()));
    }
    setPreset(key);
  };

  React.useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => setRefreshTick((tick) => tick + 1), 30_000);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  React.useEffect(() => {
    if (!usage) {
      setError('用量分析服务不可用，请检查插件加载状态。');
      setData(null);
      return;
    }
    if (!range) {
      setError(null);
      setData(null);
      return;
    }
    let cancelled = false;
    setError(null);
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
        setUpdatedAt(Date.now());
      } catch (caught) {
        if (cancelled) return;
        if (!hasDataRef.current) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usage, range, refreshTick, reload]);

  const controls = React.createElement(
    'div',
    { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg } },
    React.createElement(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs } },
      (['today', '7d', '30d', 'custom'] as RangePreset[]).map((key) =>
        React.createElement(
          'button',
          { key: key, style: btnStyle(preset === key), onClick: () => selectPreset(key), type: 'button' },
          key === 'custom' ? '自定义' : presetLabel(key as PresetKey),
        ),
      ),
      preset === 'custom'
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement('input', {
              type: 'date',
              style: filterInputStyle,
              value: customFrom,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCustomFrom(e.target.value),
            }),
            React.createElement('span', { style: { fontSize: font.label, color: palette.labelTertiary } }, '至'),
            React.createElement('input', {
              type: 'date',
              style: filterInputStyle,
              value: customTo,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCustomTo(e.target.value),
            }),
          )
        : null,
    ),
    React.createElement(
      'div',
      { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: spacing.xs } },
      updatedAt !== null
        ? React.createElement(
            'span',
            { style: { fontSize: font.caption, color: palette.labelTertiary, marginRight: spacing.sm } },
            `更新于 ${fmtTime(updatedAt)}`,
          )
        : null,
      React.createElement(
        'button',
        { style: btnStyle(autoRefresh), onClick: () => setAutoRefresh((v) => !v), title: '开启后每 30 秒自动刷新', type: 'button' },
        autoRefresh ? '自动刷新：开' : '自动刷新',
      ),
      React.createElement(
        'button',
        { style: btnStyle(false), onClick: () => setReload((r) => r + 1), title: '立即重新加载', type: 'button' },
        '刷新',
      ),
    ),
  );

  if (error !== null && data === null) {
    return React.createElement(
      'div',
      null,
      controls,
      React.createElement(
        'div',
        { style: { color: palette.danger } },
        React.createElement('span', null, `加载失败：${error}`),
        React.createElement(
          'button',
          { style: { ...btnStyle(false), marginLeft: spacing.sm }, onClick: () => setReload((r) => r + 1), type: 'button' },
          '重试',
        ),
      ),
    );
  }

  if (data === null) {
    return React.createElement(
      'div',
      null,
      controls,
      React.createElement(KpiSkeleton, null),
      React.createElement('div', { style: { marginTop: spacing.lg } }, React.createElement(ChartSkeleton, null)),
      React.createElement('div', { style: { marginTop: spacing.lg } }, React.createElement(ListSkeleton, null)),
    );
  }

  if (data.overview.requestCount === 0) {
    return React.createElement(
      'div',
      null,
      controls,
      React.createElement(
        Card,
        { style: { marginTop: spacing.lg } },
        React.createElement(EmptyState, { title: '当前时间范围暂无数据', description: '换个时间范围试试，或先发起一些请求。' }),
      ),
    );
  }

  const maxSessionTokens = Math.max(1, ...data.sessions.slice(0, 5).map((s) => s.totalTokens));

  return React.createElement(
    'div',
    null,
    controls,
    React.createElement(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', gap: spacing.md } },
      React.createElement(StatCard, { label: '请求数', value: String(data.overview.requestCount) }),
      React.createElement(StatCard, { label: '总 Tokens', value: fmt(data.overview.totalTokens) }),
      React.createElement(StatCard, { label: '成功率', value: fmtPct(data.overview.successRate) }),
      React.createElement(StatCard, { label: '缓存命中', value: fmtPct(data.overview.cacheHitRate) }),
    ),
    React.createElement(
      'div',
      { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: spacing.md, marginTop: spacing.lg } },
      React.createElement(
        Card,
        null,
        React.createElement('div', { style: cardTitleStyle }, 'Token 用量'),
        tokenRow('输入', data.overview.inputTokens, data.overview.totalTokens),
        tokenRow('缓存', data.overview.cachedInputTokens, data.overview.totalTokens),
        tokenRow('输出', data.overview.outputTokens, data.overview.totalTokens),
        tokenRow('总量', data.overview.totalTokens, data.overview.totalTokens, true),
      ),
      React.createElement(
        Card,
        null,
        React.createElement('div', { style: cardTitleStyle }, '性能'),
        metricRow('平均耗时', fmtMs(data.overview.avgDurationMs)),
        metricRow('P95', fmtMs(data.overview.p95DurationMs)),
        metricRow('Tokens/请求', fmt(data.overview.tokensPerRequest)),
      ),
    ),
    React.createElement(
      Section,
      {
        title: 'Token 趋势',
        action: React.createElement(
          'div',
          { style: { display: 'flex', gap: spacing.xs } },
          (['tokens', 'requests'] as TrendMetric[]).map((m) =>
            React.createElement(
              'button',
              { key: m, style: btnStyle(trendMetric === m), onClick: () => setTrendMetric(m), type: 'button' },
              m === 'tokens' ? 'Tokens' : '请求数',
            ),
          ),
        ),
      },
      React.createElement(Card, null, React.createElement(TrendChart, { buckets: data.trend, metric: trendMetric })),
    ),
    React.createElement(
      Section,
      { title: 'Provider 与 Model' },
      React.createElement(
        'div',
        { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: spacing.md } },
        React.createElement(Card, null, routeBars('Provider', data.providers.map((p) => ({ name: p.provider, requestCount: p.requestCount, totalTokens: p.totalTokens })))),
        React.createElement(Card, null, routeBars('Model', data.models.map((m) => ({ name: m.model, requestCount: m.requestCount, totalTokens: m.totalTokens })))),
      ),
    ),
    React.createElement(
      Section,
      { title: '最近请求' },
      React.createElement(
        Card,
        null,
        data.requests.length === 0
          ? React.createElement(EmptyState, { title: '该范围内没有请求记录' })
          : data.requests.map((r) => recentRow(r)),
      ),
    ),
    React.createElement(
      Section,
      { title: '会话排行（按 Token）' },
      React.createElement(
        Card,
        null,
        data.sessions.slice(0, 5).map((s, i) =>
          sessionRow(s, i, maxSessionTokens),
        ),
      ),
    ),
  );
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: font.cardTitle,
  fontWeight: 600,
  color: palette.labelPrimary,
  marginBottom: spacing.lg,
};

function tokenRow(label: string, value: number, total: number, full = false): React.ReactElement {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return React.createElement(
    'div',
    { style: { marginBottom: spacing.md } },
    React.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', fontSize: font.body } },
      React.createElement('span', { style: { color: palette.labelSecondary } }, label),
      React.createElement('span', { style: { color: palette.labelPrimary, fontVariantNumeric: 'tabular-nums' } }, fmt(value)),
    ),
    React.createElement(
      'div',
      { style: { height: 6, background: palette.skeleton, borderRadius: 3, marginTop: spacing.xs } },
      React.createElement('div', {
        style: {
          height: '100%',
          width: `${full ? 100 : Math.min(100, Math.max(1, pct))}%`,
          background: full ? palette.labelTertiary : palette.primary,
          borderRadius: 3,
        },
      }),
    ),
  );
}

function metricRow(label: string, value: string): React.ReactElement {
  return React.createElement(
    'div',
    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.sm}px 0`, borderBottom: `1px solid ${palette.borderSubtle}`, fontSize: font.body } },
    React.createElement('span', { style: { color: palette.labelSecondary } }, label),
    React.createElement('span', { style: { color: palette.labelPrimary, fontWeight: 500, fontVariantNumeric: 'tabular-nums' } }, value),
  );
}

function TrendChart(props: { buckets: TrendBucket[]; metric: TrendMetric }): React.ReactElement {
  const { buckets, metric } = props;
  const values = buckets.map((b) => (metric === 'tokens' ? b.totalTokens : b.requestCount));
  const max = Math.max(1, ...values);
  const W = 640;
  const H = 180;
  const PAD_X = 44;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 24;
  const n = values.length;
  const x = (i: number): number => (n <= 1 ? PAD_X : PAD_X + (i * (W - 2 * PAD_X)) / (n - 1));
  const y = (v: number): number => H - PAD_BOTTOM - (v / max) * (H - PAD_TOP - PAD_BOTTOM);
  const points = values.map((v, i) => [x(i), y(v)] as const);
  const line = points.map(([px, py]) => `${px},${py}`).join(' ');
  const area = points.length > 1 ? `M${points[0]![0]},${H - PAD_BOTTOM} L${line.replace(/ /g, ' L')} L${points[points.length - 1]![0]},${H - PAD_BOTTOM} Z` : '';
  const labelStep = Math.max(1, Math.ceil(n / 6));

  return React.createElement(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', height: 'auto', display: 'block' } },
    [0, 0.5, 1].map((f) =>
      React.createElement(
        'g',
        { key: f },
        React.createElement('line', {
          x1: PAD_X,
          x2: W - PAD_X,
          y1: y(max * f),
          y2: y(max * f),
          stroke: palette.borderSubtle,
          strokeWidth: 1,
        }),
        React.createElement('text', {
          x: PAD_X - 6,
          y: y(max * f) + 3,
          textAnchor: 'end',
          fontSize: 10,
          fill: palette.labelTertiary,
        }, fmt(max * f)),
      ),
    ),
    points.length > 1
      ? React.createElement('path', { d: area, fill: palette.primary, opacity: 0.15 })
      : null,
    React.createElement('polyline', {
      points: line,
      fill: 'none',
      stroke: palette.primary,
      strokeWidth: 2,
      strokeLinejoin: 'round',
      strokeLinecap: 'round',
    }),
    buckets.map((b, i) =>
      i % labelStep === 0 || i === buckets.length - 1
        ? React.createElement('text', {
            key: b.bucketStart,
            x: x(i),
            y: H - 8,
            textAnchor: 'middle',
            fontSize: 10,
            fill: palette.labelTertiary,
          }, fmtDay(b.bucketStart))
        : null,
    ),
  );
}

function routeBars(title: string, items: Array<{ name: string; requestCount: number; totalTokens: number }>): React.ReactElement {
  const max = Math.max(1, ...items.map((i) => i.totalTokens));
  return React.createElement(
    'div',
    null,
    items.length === 0
      ? React.createElement(EmptyState, { title: '暂无数据' })
      : items.map((item) =>
          React.createElement(
            'div',
            { key: item.name, style: { marginBottom: spacing.md } },
            React.createElement(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', gap: spacing.md, fontSize: font.body } },
              React.createElement('span', { style: { color: palette.labelPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.name),
              React.createElement('span', { style: { color: palette.labelTertiary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, `${item.requestCount} 请求 · ${fmt(item.totalTokens)}`),
            ),
            React.createElement(
              'div',
              { style: { height: 8, background: palette.skeleton, borderRadius: 4, marginTop: spacing.xs } },
              React.createElement('div', {
                style: { height: '100%', width: `${Math.max(1, (item.totalTokens / max) * 100)}%`, background: palette.primary, borderRadius: 4 },
              }),
            ),
          ),
        ),
  );
}

function recentRow(row: UsageRecordRow): React.ReactElement {
  return React.createElement(
    'div',
    {
      key: row.id,
      style: { padding: `${spacing.sm}px ${spacing.xs}px`, borderBottom: `1px solid ${palette.borderSubtle}` },
    },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: spacing.md, fontSize: font.body } },
      React.createElement('span', { style: { width: 110, flex: 'none', fontSize: font.caption, color: palette.labelTertiary, fontVariantNumeric: 'tabular-nums' } }, fmtTime(row.startedAt)),
      React.createElement(
        'div',
        { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { style: { color: palette.labelPrimary, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.model ?? '—'),
        React.createElement('div', { style: { fontSize: font.caption, color: palette.labelTertiary } }, row.provider ?? '—'),
      ),
      React.createElement('span', { style: { width: 110, flex: 'none', textAlign: 'right', color: palette.labelPrimary, fontVariantNumeric: 'tabular-nums' } }, fmt(row.totalTokens)),
      React.createElement('span', { style: { width: 70, flex: 'none', textAlign: 'right', color: palette.labelSecondary, fontVariantNumeric: 'tabular-nums' } }, fmtMs(row.durationMs)),
      React.createElement('div', { style: { width: 90, flex: 'none', textAlign: 'right' } }, statusBadge(row.status)),
    ),
    React.createElement(
      'div',
      { style: { marginTop: 2, paddingLeft: 118, fontSize: font.caption, color: palette.labelTertiary, fontVariantNumeric: 'tabular-nums' } },
      `输入 ${fmt(row.inputTokens)} · 缓存 ${fmt((row.cacheReadTokens ?? 0) + (row.cacheWriteTokens ?? 0))} · 输出 ${fmt(row.outputTokens)}`,
    ),
  );
}

function sessionRow(session: SessionStats, index: number, maxTokens: number): React.ReactElement {
  const id = session.sessionId.length > 18 ? `${session.sessionId.slice(0, 8)}…${session.sessionId.slice(-6)}` : session.sessionId;
  return React.createElement(
    'div',
    { key: session.sessionId, style: { marginBottom: spacing.md } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: spacing.md, fontSize: font.body } },
      React.createElement('span', { style: { color: palette.labelTertiary, fontVariantNumeric: 'tabular-nums' } }, String(index + 1).padStart(2, '0')),
      React.createElement(
        'div',
        { style: { flex: 1, minWidth: 0 } },
        React.createElement(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', gap: spacing.md } },
          React.createElement('span', { style: { color: palette.labelPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, id),
          React.createElement('span', { style: { color: palette.labelTertiary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, `${session.requestCount} 请求 · ${fmt(session.totalTokens)}`),
        ),
      ),
    ),
    React.createElement(
      'div',
      { style: { height: 6, background: palette.skeleton, borderRadius: 3, marginTop: spacing.xs, marginLeft: spacing.xl } },
      React.createElement('div', {
        style: { height: '100%', width: `${Math.max(1, (session.totalTokens / maxTokens) * 100)}%`, background: palette.primary, borderRadius: 3, opacity: 0.8 },
      }),
    ),
  );
}
