/**
 * Client-side Typert remote contribution for the `usageAnalytics` namespace.
 *
 * Codecs use `src-json` (no zod schemas): strict codecs require a generated
 * `typert.host.js` artifact (dsh-typert-generator), which is NOT part of a
 * third-party plugin — with `src-json` the gateway's SRC fallback applies
 * (verified in the Typert audit, harness-api.md §7.3).
 */
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';

const json = { mode: 'src-json' } as const;

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-usage-analytics',
  descriptors: [
    {
      id: 'dsh-usage-analytics#usageAnalytics/getOverview',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getOverview',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'range', wire: 'range', source: 'json', codec: json }],
      result: json,
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/getTrend',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getTrend',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'range', wire: 'range', source: 'json', codec: json },
        { name: 'granularity', wire: 'granularity', source: 'json', codec: json, acceptsUndefined: true },
      ],
      result: json,
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/getProviderStats',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getProviderStats',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'range', wire: 'range', source: 'json', codec: json }],
      result: json,
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/getModelStats',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getModelStats',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'range', wire: 'range', source: 'json', codec: json }],
      result: json,
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/listRequests',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'listRequests',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'query', wire: 'query', source: 'json', codec: json, acceptsUndefined: true }],
      result: json,
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/getRequest',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getRequest',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'id', wire: 'id', source: 'json', codec: json }],
      result: json,
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/listSessions',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'listSessions',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'range', wire: 'range', source: 'json', codec: json }],
      result: json,
    },
    {
      id: 'dsh-usage-analytics#usageAnalytics/getSession',
      service: 'usageAnalytics',
      namespace: 'usageAnalytics',
      method: 'getSession',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: json }],
      result: json,
    },
  ],
};
