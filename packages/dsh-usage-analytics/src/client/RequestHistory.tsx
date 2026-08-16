/**
 * 用量分析 —— 请求历史 Tab（UI 2.0）。
 * 筛选 + 排序 + 分页 + 紧凑行列表，点击行打开请求详情抽屉。
 */
import React from 'react';
import type { RequestStatus } from '../model/types.js';
import type { Paginated, RequestQuery } from '../query/types.js';
import type { UsageRecordRow } from '../storage/UsageRepository.js';
import type { UsageRemote } from './client-types.js';
import { RequestDetailDrawer } from './RequestDetailDrawer.js';
import {
  btnStyle,
  filterInputStyle,
  filterSelectStyle,
  fmt,
  fmtMs,
  fmtTime,
  PRESET_KEYS,
  presetLabel,
  presetRange,
  unwrap,
  type PresetKey,
} from './shared.js';
import { Card, EmptyState, ListSkeleton, statusBadge } from './ui/index.js';
import { font, palette, radius, spacing } from './ui/tokens.js';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{ value: RequestStatus; label: string }> = [
  { value: 'SUCCESS', label: '成功' },
  { value: 'ERROR', label: '错误' },
  { value: 'ABORTED', label: '中断' },
  { value: 'MAX_TOKENS', label: '达到上限' },
  { value: 'UNKNOWN', label: '未知' },
];

type SortField = 'time' | 'duration' | 'totalTokens';

const SORT_FIELDS: Array<{ field: SortField; label: string }> = [
  { field: 'time', label: '时间' },
  { field: 'duration', label: '耗时' },
  { field: 'totalTokens', label: '总量' },
];

const optionStyle: React.CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2, #1e1f24)',
  color: 'var(--dsw-alias-label-primary, #e8e8e8)',
};

interface RequestHistoryProps {
  usage: UsageRemote | undefined;
}

export function RequestHistory(props: RequestHistoryProps): React.ReactElement {
  const { usage } = props;
  const [preset, setPreset] = React.useState<PresetKey>('7d');
  const [provider, setProvider] = React.useState('all');
  const [model, setModel] = React.useState('all');
  const [status, setStatus] = React.useState<RequestStatus | 'all'>('all');
  const [searchInput, setSearchInput] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [sortBy, setSortBy] = React.useState<SortField>('time');
  const [order, setOrder] = React.useState<'asc' | 'desc'>('desc');
  const [page, setPage] = React.useState(0);
  const [reload, setReload] = React.useState(0);
  const [data, setData] = React.useState<Paginated<UsageRecordRow> | null>(null);
  const [providerOptions, setProviderOptions] = React.useState<string[]>([]);
  const [modelOptions, setModelOptions] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [detailRow, setDetailRow] = React.useState<UsageRecordRow | null>(null);
  const [hoveredId, setHoveredId] = React.useState<number | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  React.useEffect(() => {
    if (!usage) {
      setError('用量分析服务不可用，请检查插件加载状态。');
      setData(null);
      return;
    }
    const range = presetRange(preset);
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const query: RequestQuery = {
          ...range,
          ...(provider !== 'all' ? { provider } : {}),
          ...(model !== 'all' ? { model } : {}),
          ...(status !== 'all' ? { status } : {}),
          ...(search.trim() !== '' ? { search: search.trim() } : {}),
          sortBy,
          order,
          offset: page * PAGE_SIZE,
          limit: PAGE_SIZE,
        };
        const [pageResult, providerStats, modelStats] = await Promise.all([
          unwrap(usage.listRequests(query)),
          unwrap(usage.getProviderStats(range)),
          unwrap(usage.getModelStats(range)),
        ]);
        if (cancelled) return;
        setData(pageResult);
        setProviderOptions(providerStats.map((p) => p.provider).sort());
        setModelOptions(modelStats.map((m) => m.model).sort());
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usage, preset, provider, model, status, search, sortBy, order, page, reload]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const onSort = (field: SortField): void => {
    if (field === sortBy) setOrder(order === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(field);
      setOrder('desc');
    }
    setPage(0);
  };
  const resetFilters = (): void => {
    setProvider('all');
    setModel('all');
    setStatus('all');
    setSearchInput('');
    setSearch('');
    setPage(0);
  };

  return React.createElement(
    'div',
    null,
    React.createElement(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg } },
      PRESET_KEYS.map((key) =>
        React.createElement(
          'button',
          { key: key, style: btnStyle(preset === key), onClick: () => { setPreset(key); setPage(0); }, type: 'button' },
          presetLabel(key),
        ),
      ),
      React.createElement(
        'select',
        {
          style: filterSelectStyle,
          value: provider,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => { setProvider(e.target.value); setPage(0); },
        },
        React.createElement('option', { value: 'all', style: optionStyle }, '全部 Provider'),
        providerOptions.map((p) => React.createElement('option', { key: p, value: p, style: optionStyle }, p)),
      ),
      React.createElement(
        'select',
        {
          style: filterSelectStyle,
          value: model,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => { setModel(e.target.value); setPage(0); },
        },
        React.createElement('option', { value: 'all', style: optionStyle }, '全部 Model'),
        modelOptions.map((m) => React.createElement('option', { key: m, value: m, style: optionStyle }, m)),
      ),
      React.createElement(
        'select',
        {
          style: filterSelectStyle,
          value: status,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => { setStatus(e.target.value as RequestStatus | 'all'); setPage(0); },
        },
        React.createElement('option', { value: 'all', style: optionStyle }, '全部状态'),
        STATUS_OPTIONS.map((s) => React.createElement('option', { key: s.value, value: s.value, style: optionStyle }, s.label)),
      ),
      React.createElement('input', {
        style: filterInputStyle,
        placeholder: '搜索会话 / Provider / Model / 错误信息',
        value: searchInput,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value),
      }),
      React.createElement(
        'button',
        { style: btnStyle(false), onClick: resetFilters, type: 'button' },
        '重置筛选',
      ),
    ),
    error !== null && data === null
      ? React.createElement(
          'div',
          { style: { color: palette.danger } },
          React.createElement('span', null, `加载失败：${error}`),
          React.createElement(
            'button',
            { style: { ...btnStyle(false), marginLeft: spacing.sm }, onClick: () => setReload((r) => r + 1), type: 'button' },
            '重试',
          ),
        )
      : data === null
        ? React.createElement(ListSkeleton, { rows: 8 })
        : data.total === 0
          ? React.createElement(
              Card,
              null,
              React.createElement(EmptyState, { title: '该范围内没有请求记录', description: '换个时间范围或清除筛选条件试试。' }),
            )
          : React.createElement(
              'div',
              null,
              React.createElement(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm } },
                React.createElement('span', { style: { fontSize: font.label, color: palette.labelTertiary, marginRight: spacing.sm } }, '排序'),
                SORT_FIELDS.map((f) =>
                  React.createElement(
                    'button',
                    {
                      key: f.field,
                      style: btnStyle(sortBy === f.field),
                      onClick: () => onSort(f.field),
                      type: 'button',
                    },
                    `${f.label}${sortBy === f.field ? (order === 'asc' ? ' ↑' : ' ↓') : ''}`,
                  ),
                ),
              ),
              React.createElement(
                'div',
                { style: { border: `1px solid ${palette.borderSubtle}`, borderRadius: radius.md, overflow: 'hidden' } },
                data.items.map((row) =>
                  React.createElement(
                    'div',
                    {
                      key: row.id,
                      onClick: () => setDetailRow(row),
                      onMouseEnter: () => setHoveredId(row.id),
                      onMouseLeave: () => setHoveredId(null),
                      style: {
                        cursor: 'pointer',
                        padding: `${spacing.sm}px ${spacing.md}px`,
                        borderBottom: `1px solid ${palette.borderSubtle}`,
                        background: hoveredId === row.id ? 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.08))' : 'transparent',
                      },
                    },
                    React.createElement(
                      'div',
                      { style: { display: 'flex', alignItems: 'center', gap: spacing.md, fontSize: font.body } },
                      React.createElement('span', { style: { width: 104, flex: 'none', fontSize: font.caption, color: palette.labelTertiary, fontVariantNumeric: 'tabular-nums' } }, fmtTime(row.startedAt)),
                      React.createElement(
                        'div',
                        { style: { flex: 1, minWidth: 0 } },
                        React.createElement('div', { style: { color: palette.labelPrimary, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.model ?? '—'),
                        React.createElement('div', { style: { fontSize: font.caption, color: palette.labelTertiary } }, row.provider ?? '—'),
                      ),
                      React.createElement(
                        'div',
                        { style: { width: 200, flex: 'none', textAlign: 'right' } },
                        React.createElement('div', { style: { color: palette.labelPrimary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }, fmt(row.totalTokens)),
                        React.createElement(
                          'div',
                          { style: { marginTop: 2, fontSize: font.caption, color: palette.labelTertiary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } },
                          `输入 ${fmt(row.inputTokens)} · 缓存 ${fmt((row.cacheReadTokens ?? 0) + (row.cacheWriteTokens ?? 0))} · 输出 ${fmt(row.outputTokens)}`,
                        ),
                      ),
                      React.createElement('span', { style: { width: 64, flex: 'none', textAlign: 'right', color: palette.labelSecondary, fontVariantNumeric: 'tabular-nums' } }, fmtMs(row.durationMs)),
                      React.createElement('div', { style: { width: 88, flex: 'none', textAlign: 'right' } }, statusBadge(row.status)),
                    ),
                  ),
                ),
              ),
              React.createElement(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, fontSize: font.label, color: palette.labelSecondary } },
                React.createElement('span', null, `共 ${data.total} 条 · 第 ${Math.min(page + 1, totalPages)} / ${totalPages} 页`),
                React.createElement(
                  'button',
                  { style: btnStyle(false), disabled: page === 0, onClick: () => setPage((p) => Math.max(0, p - 1)), type: 'button' },
                  '上一页',
                ),
                React.createElement(
                  'button',
                  { style: btnStyle(false), disabled: page + 1 >= totalPages, onClick: () => setPage((p) => p + 1), type: 'button' },
                  '下一页',
                ),
              ),
            ),
    React.createElement(RequestDetailDrawer, { row: detailRow, onClose: () => setDetailRow(null) }),
  );
}
