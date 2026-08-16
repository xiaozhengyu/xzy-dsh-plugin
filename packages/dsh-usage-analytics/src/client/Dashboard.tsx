/**
 * Usage Analytics dashboard — registered in the `settings.section` slot.
 * All data arrives through the injected `usage` remote namespace
 * (ctx.remote.usageAnalytics.*, Typert RPC — harness-api.md §7.3).
 * Plain React (no JSX runtime deps beyond the shell seed), inline styles only.
 */
import React from 'react';
import type { RemoteResult, TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol';
import type {
  ModelStats,
  OverviewMetrics,
  ProviderStats,
  RequestQuery,
  SessionStats,
  TimeRange,
  TrendBucket,
} from '../query/types.js';
import type { UsageRecordRow } from '../storage/UsageRepository.js';

/** The injected remote namespace prop (undefined when the mount failed). */
type UsageRemote = TypertRemoteNamespaceMap['usageAnalytics'];

export interface DashboardProps {
  usage: UsageRemote | undefined;
}

type PresetKey = 'today' | '7d' | '30d';

const DAY_MS = 24 * 3_600_000;

function presetRange(key: PresetKey): TimeRange {
  const now = Date.now();
  if (key === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.getTime(), to: now };
  }
  if (key === '30d') return { from: now - 30 * DAY_MS, to: now };
  return { from: now - 7 * DAY_MS, to: now };
}

async function unwrap<T>(promise: Promise<RemoteResult<T>>): Promise<T> {
  const result = await promise;
  if (result.ok) return result.value;
  const error = result.error as { message?: string } | undefined;
  throw new Error(error?.message ?? 'usage-analytics remote call failed');
}

interface DashboardData {
  overview: OverviewMetrics;
  trend: TrendBucket[];
  providers: ProviderStats[];
  models: ModelStats[];
  requests: UsageRecordRow[];
  sessions: SessionStats[];
}

const cardStyle: React.CSSProperties = {
  background: 'var(--theme-surface, rgba(127,127,127,0.08))',
  borderRadius: 8,
  padding: '12px 16px',
  minWidth: 130,
};
const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.65, marginBottom: 4 };
const valueStyle: React.CSSProperties = { fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums' };
const sectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, margin: '20px 0 8px' };
const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', opacity: 0.6, borderBottom: '1px solid var(--theme-border, rgba(127,127,127,0.25))' };
const tdStyle: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--theme-border, rgba(127,127,127,0.15))' };
const btnStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  marginRight: 6,
  borderRadius: 6,
  border: '1px solid var(--theme-border, rgba(127,127,127,0.3))',
  background: active ? 'var(--theme-primary, rgba(120,160,255,0.25))' : 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
});

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function fmtPct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(5, 16).replace('T', ' ');
}

export function Dashboard(props: DashboardProps): React.ReactElement {
  const { usage } = props;
  const [preset, setPreset] = React.useState<PresetKey>('7d');
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!usage) {
      setError('usage-analytics remote unavailable');
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
    { style: { fontFamily: 'inherit', padding: '4px 2px' } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
      React.createElement('span', { style: { fontSize: 16, fontWeight: 700 } }, 'Usage Analytics'),
      React.createElement(
        'div',
        { style: { marginLeft: 'auto' } },
        (['today', '7d', '30d'] as PresetKey[]).map((key) =>
          React.createElement(
            'button',
            { key: key, style: btnStyle(preset === key), onClick: () => setPreset(key) },
            key === 'today' ? 'Today' : key,
          ),
        ),
      ),
    ),
    error !== null
      ? React.createElement('div', { style: { color: 'var(--theme-danger, #e5534b)' } }, `Failed to load usage data: ${error}`)
      : data === null
        ? React.createElement('div', { style: { opacity: 0.6 } }, 'Loading…')
        : React.createElement(
            React.Fragment,
            null,
            React.createElement(
              'div',
              { style: { display: 'flex', flexWrap: 'wrap', gap: 10 } },
              card('Requests', String(data.overview.requestCount)),
              card('Total Tokens', fmt(data.overview.totalTokens)),
              card('Input', fmt(data.overview.inputTokens)),
              card('Cache Read', fmt(data.overview.cacheReadTokens)),
              card('Output', fmt(data.overview.outputTokens)),
              card('Success', fmtPct(data.overview.successRate)),
              card('Cache Hit', fmtPct(data.overview.cacheHitRate)),
              card('Avg Duration', fmtMs(data.overview.avgDurationMs)),
              card('P95', fmtMs(data.overview.p95DurationMs)),
              card('Tokens/Req', fmt(data.overview.tokensPerRequest)),
            ),
            React.createElement('div', { style: sectionTitleStyle }, 'Token Trend / Day'),
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
            React.createElement('div', { style: sectionTitleStyle }, 'Providers'),
            statsTable(
              data.providers.map((p) => [p.provider, String(p.requestCount), fmt(p.totalTokens), fmtPct(p.successRate)]),
            ),
            React.createElement('div', { style: sectionTitleStyle }, 'Models'),
            statsTable(
              data.models.map((m) => [m.model, String(m.requestCount), fmt(m.totalTokens), fmtPct(m.successRate)]),
            ),
            React.createElement('div', { style: sectionTitleStyle }, 'Recent Requests'),
            React.createElement(
              'table',
              { style: tableStyle },
              React.createElement(
                'thead',
                null,
                React.createElement(
                  'tr',
                  null,
                  ['Time', 'Provider', 'Model', 'Total', 'Status', 'Duration'].map((h) =>
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
                    React.createElement('td', { style: tdStyle }, fmt(r.totalTokens)),
                    React.createElement('td', { style: tdStyle }, r.status),
                    React.createElement('td', { style: tdStyle }, fmtMs(r.durationMs)),
                  ),
                ),
              ),
            ),
            React.createElement('div', { style: sectionTitleStyle }, 'Sessions (top by tokens)'),
            statsTable(
              data.sessions.slice(0, 5).map((s) => [shortId(s), String(s.requestCount), fmt(s.totalTokens), fmtPct(s.successRate)]),
            ),
          ),
  );
}

function shortId(session: SessionStats): string {
  return session.sessionId.length > 18 ? `${session.sessionId.slice(0, 8)}…${session.sessionId.slice(-6)}` : session.sessionId;
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
