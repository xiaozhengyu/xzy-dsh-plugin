/**
 * Client-side Typert remote contribution for the `usageAnalytics` namespace.
 *
 * The HOST gateway accepts `@Remote` methods through its SRC fallback with
 * `src-json` codecs, but the CLIENT `$mount` gate (dsh-api-gateway's
 * `requireStrictCodec`) rejects every non-strict codec, so each parameter and
 * result must carry `mode: 'strict'` with a real zod schema. The wire stays
 * pass-through: the host SRC descriptors validate JSON-safety, and these
 * schemas are deliberately permissive (`z.any()`) rather than duplicating the
 * query vocabulary as a second source of truth.
 */
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';

/** Strict pass-through codec satisfying the client mount gate. */
function strict(typeSymbol: string) {
  return { mode: 'strict', typeSymbol, schema: z.any() } as const;
}

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-usage-analytics',
  descriptors: [
    {
      id: 'dsh-usage-analytics#usageAnalytics/getOverview',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getOverview',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'range', wire: 'range', source: 'json', codec: strict('dsh-usage-analytics/query#TimeRange') }],
      result: strict('dsh-usage-analytics/query#OverviewMetrics'),
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/getTrend',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getTrend',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'range', wire: 'range', source: 'json', codec: strict('dsh-usage-analytics/query#TimeRange') },
        { name: 'granularity', wire: 'granularity', source: 'json', codec: strict('dsh-usage-analytics/query#Granularity'), acceptsUndefined: true },
      ],
      result: strict('dsh-usage-analytics/query#TrendBucket[]'),
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/getProviderStats',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getProviderStats',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'range', wire: 'range', source: 'json', codec: strict('dsh-usage-analytics/query#TimeRange') }],
      result: strict('dsh-usage-analytics/query#ProviderStats[]'),
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/getModelStats',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getModelStats',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'range', wire: 'range', source: 'json', codec: strict('dsh-usage-analytics/query#TimeRange') }],
      result: strict('dsh-usage-analytics/query#ModelStats[]'),
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/listRequests',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'listRequests',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'query', wire: 'query', source: 'json', codec: strict('dsh-usage-analytics/query#RequestQuery'), acceptsUndefined: true }],
      result: strict('dsh-usage-analytics/query#Paginated<UsageRecordRow>'),
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/getRequest',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getRequest',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'id', wire: 'id', source: 'json', codec: strict('dsh-usage-analytics/storage#UsageRecordRowId') }],
      result: strict('dsh-usage-analytics/storage#UsageRecordRow|null'),
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/listSessions',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'listSessions',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'range', wire: 'range', source: 'json', codec: strict('dsh-usage-analytics/query#TimeRange') }],
      result: strict('dsh-usage-analytics/query#SessionStats[]'),
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/getSession',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getSession',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: strict('dsh-usage-analytics/query#SessionId') }],
      result: strict('dsh-usage-analytics/query#SessionDetail|null'),
    },
  ],
};
