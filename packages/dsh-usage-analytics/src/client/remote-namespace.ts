/**
 * Client-side typing of the `usageAnalytics` Typert remote namespace
 * (harness-api.md §7.3; pattern mirrors dsh-goal/lib/typert.remote-client.d.ts).
 *
 * The `$`-suffixed interface name is the hex encoding of the namespace
 * ('usageAnalytics' → 7573616765416e616c7974696373), matching the generated
 * convention. Methods return `RemoteResult<T>`; results are plain JSON
 * (host returns `null` instead of `undefined` for optional lookups).
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type {
  Granularity,
  ModelStats,
  OverviewMetrics,
  Paginated,
  ProviderStats,
  RequestQuery,
  SessionDetail,
  SessionStats,
  TimeRange,
  TrendBucket,
} from '../query/types.js';
import type { UsageRecordRow } from '../storage/UsageRepository.js';

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$7573616765416e616c7974696373 {
    getOverview(range: TimeRange): Promise<RemoteResult<OverviewMetrics>>;
    getTrend(range: TimeRange, granularity?: Granularity): Promise<RemoteResult<TrendBucket[]>>;
    getProviderStats(range: TimeRange): Promise<RemoteResult<ProviderStats[]>>;
    getModelStats(range: TimeRange): Promise<RemoteResult<ModelStats[]>>;
    listRequests(query?: RequestQuery): Promise<RemoteResult<Paginated<UsageRecordRow>>>;
    getRequest(id: number): Promise<RemoteResult<UsageRecordRow | null>>;
    listSessions(range: TimeRange): Promise<RemoteResult<SessionStats[]>>;
    getSession(sessionId: string): Promise<RemoteResult<SessionDetail | null>>;
  }
  interface TypertRemoteMap {
    'usageAnalytics/getOverview'(range: TimeRange): Promise<RemoteResult<OverviewMetrics>>;
    'usageAnalytics/getTrend'(range: TimeRange, granularity?: Granularity): Promise<RemoteResult<TrendBucket[]>>;
    'usageAnalytics/getProviderStats'(range: TimeRange): Promise<RemoteResult<ProviderStats[]>>;
    'usageAnalytics/getModelStats'(range: TimeRange): Promise<RemoteResult<ModelStats[]>>;
    'usageAnalytics/listRequests'(query?: RequestQuery): Promise<RemoteResult<Paginated<UsageRecordRow>>>;
    'usageAnalytics/getRequest'(id: number): Promise<RemoteResult<UsageRecordRow | null>>;
    'usageAnalytics/listSessions'(range: TimeRange): Promise<RemoteResult<SessionStats[]>>;
    'usageAnalytics/getSession'(sessionId: string): Promise<RemoteResult<SessionDetail | null>>;
  }
  interface TypertRemoteNamespaceMap {
    'usageAnalytics': TypertRemoteNamespace$7573616765416e616c7974696373;
  }
}

export {};
