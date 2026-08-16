/**
 * 用量分析 —— 请求历史 Tab。
 * 时间预设 + Provider / Model / 状态筛选 + 关键词搜索 + 列排序 + 分页。
 */
import React from 'react';
import type { RequestStatus } from '../model/types.js';
import type { Paginated, RequestQuery } from '../query/types.js';
import type { UsageRecordRow } from '../storage/UsageRepository.js';
import type { UsageRemote } from './client-types.js';
import {
  btnStyle,
  filterInputStyle,
  filterSelectStyle,
  fmt,
  fmtDate,
  fmtMs,
  PRESET_KEYS,
  presetLabel,
  presetRange,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  unwrap,
  type PresetKey,
} from './shared.js';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{ value: RequestStatus; label: string }> = [
  { value: 'SUCCESS', label: '成功' },
  { value: 'ERROR', label: '错误' },
  { value: 'ABORTED', label: '中断' },
  { value: 'MAX_TOKENS', label: '达到上限' },
  { value: 'UNKNOWN', label: '未知' },
];

type SortField = 'time' | 'duration' | 'totalTokens';

const SORTABLE_COLUMNS: Array<{ field: SortField; label: string }> = [
  { field: 'time', label: '时间' },
  { field: 'duration', label: '耗时' },
  { field: 'totalTokens', label: '总量' },
];

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

  // 搜索框防抖：停止输入 300ms 后生效。
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
    setData(null);
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

  const onPreset = (key: PresetKey): void => {
    setPreset(key);
    setProvider('all');
    setModel('all');
    setPage(0);
  };
  const onSort = (field: SortField): void => {
    if (field === sortBy) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
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
      { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 } },
      PRESET_KEYS.map((key) =>
        React.createElement(
          'button',
          { key: key, style: btnStyle(preset === key), onClick: () => onPreset(key) },
          presetLabel(key),
        ),
      ),
      React.createElement(
        'select',
        {
          style: filterSelectStyle,
          value: provider,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
            setProvider(e.target.value);
            setPage(0);
          },
        },
        React.createElement('option', { value: 'all' }, '全部 Provider'),
        providerOptions.map((p) => React.createElement('option', { key: p, value: p }, p)),
      ),
      React.createElement(
        'select',
        {
          style: filterSelectStyle,
          value: model,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
            setModel(e.target.value);
            setPage(0);
          },
        },
        React.createElement('option', { value: 'all' }, '全部 Model'),
        modelOptions.map((m) => React.createElement('option', { key: m, value: m }, m)),
      ),
      React.createElement(
        'select',
        {
          style: filterSelectStyle,
          value: status,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
            setStatus(e.target.value as RequestStatus | 'all');
            setPage(0);
          },
        },
        React.createElement('option', { value: 'all' }, '全部状态'),
        STATUS_OPTIONS.map((s) => React.createElement('option', { key: s.value, value: s.value }, s.label)),
      ),
      React.createElement('input', {
        style: filterInputStyle,
        placeholder: '搜索会话 / Provider / Model / 错误信息',
        value: searchInput,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value),
      }),
      React.createElement(
        'button',
        { style: btnStyle(false), onClick: resetFilters },
        '重置筛选',
      ),
    ),
    error !== null
      ? React.createElement(
          'div',
          { style: { color: 'var(--theme-danger, #e5534b)' } },
          React.createElement('span', null, `加载失败：${error}`),
          React.createElement(
            'button',
            { style: { ...btnStyle(false), marginLeft: 8 }, onClick: () => setReload((r) => r + 1) },
            '重试',
          ),
        )
      : data === null
        ? React.createElement('div', { style: { opacity: 0.6 } }, '加载中…')
        : data.total === 0
          ? React.createElement('div', { style: { opacity: 0.7, padding: '20px 0' } }, '该范围内没有请求记录，换个时间范围或清除筛选条件试试。')
          : React.createElement(
              React.Fragment,
              null,
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
                      SORTABLE_COLUMNS.map((c) =>
                        React.createElement(
                          'th',
                          { key: c.field, style: { ...thStyle, cursor: 'pointer', userSelect: 'none' }, onClick: () => onSort(c.field) },
                          `${c.label}${sortBy === c.field ? (order === 'asc' ? ' ↑' : ' ↓') : ''}`,
                        ),
                      ),
                      ['Provider', 'Model', '输入', '缓存读', '缓存写', '输出', '状态'].map((h) =>
                        React.createElement('th', { key: h, style: thStyle }, h),
                      ),
                    ),
                  ),
                  React.createElement(
                    'tbody',
                    null,
                    data.items.map((r) =>
                      React.createElement(
                        'tr',
                        { key: r.id },
                        React.createElement('td', { style: tdStyle }, fmtDate(r.startedAt)),
                        React.createElement('td', { style: tdStyle }, fmtMs(r.durationMs)),
                        React.createElement('td', { style: tdStyle }, fmt(r.totalTokens)),
                        React.createElement('td', { style: tdStyle }, r.provider ?? '—'),
                        React.createElement('td', { style: tdStyle }, r.model ?? '—'),
                        React.createElement('td', { style: tdStyle }, fmt(r.inputTokens)),
                        React.createElement('td', { style: tdStyle }, fmt(r.cacheReadTokens)),
                        React.createElement('td', { style: tdStyle }, fmt(r.cacheWriteTokens)),
                        React.createElement('td', { style: tdStyle }, fmt(r.outputTokens)),
                        React.createElement('td', { style: tdStyle }, statusLabel(r.status)),
                      ),
                    ),
                  ),
                ),
              ),
              React.createElement(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 12 } },
                React.createElement('span', null, `共 ${data.total} 条 · 第 ${Math.min(page + 1, totalPages)} / ${totalPages} 页`),
                React.createElement(
                  'button',
                  { style: btnStyle(false), disabled: page === 0, onClick: () => setPage((p) => Math.max(0, p - 1)) },
                  '上一页',
                ),
                React.createElement(
                  'button',
                  { style: btnStyle(false), disabled: page + 1 >= totalPages, onClick: () => setPage((p) => p + 1) },
                  '下一页',
                ),
              ),
            ),
  );
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
