import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Context } from '@deepseek-ai/cordis';
import type { Granularity, RequestQuery, TimeRange } from '../query/types.js';
import type { UsageService } from '../service/UsageService.js';

/**
 * Typert remote surface exposing the Usage query service to the packaged
 * client half (architecture doc §13, harness-api.md §7.3). Wire methods accept
 * and return plain JSON only.
 *
 * Service key / namespace: `usageAnalytics`.
 */
export class UsageRemoteService extends TypertRemoteService<never> {
  constructor(ctx: Context, private readonly queries: UsageService) {
    super(ctx, 'usageAnalytics');
  }

  @Remote
  getOverview(range: TimeRange) {
    return this.queries.getOverview(range);
  }

  @Remote
  getTrend(range: TimeRange, granularity?: Granularity) {
    return this.queries.getTrend(range, granularity);
  }

  @Remote
  getProviderStats(range: TimeRange) {
    return this.queries.getProviderStats(range);
  }

  @Remote
  getModelStats(range: TimeRange) {
    return this.queries.getModelStats(range);
  }

  @Remote
  listRequests(query?: RequestQuery) {
    return this.queries.listRequests(query);
  }

  @Remote
  getRequest(id: number) {
    return this.queries.getRequest(id) ?? null;
  }

  @Remote
  listSessions(range: TimeRange) {
    return this.queries.listSessions(range);
  }

  @Remote
  getSession(sessionId: string) {
    return this.queries.getSession(sessionId) ?? null;
  }
}
