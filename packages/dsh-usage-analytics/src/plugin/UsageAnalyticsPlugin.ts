import type { Context } from '@deepseek-ai/cordis';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import type { Session } from '@deepseek-ai/dsh-session';
import { UsageCollector } from '../collector/UsageCollector.js';
import { UsageRemoteService } from '../remote/UsageRemoteService.js';
import type { RetentionConfig } from '../service/RetentionService.js';
import type { JournalMode } from '../storage/Database.js';
import { UsageLedger } from '../storage/UsageLedger.js';

/** Cordis plugin name (also the patch-row id convention in cordis.patch.yml). */
export const name = 'usage-analytics';

export interface UsageAnalyticsPluginConfig {
  /** Set false to mount the plugin as a no-op. */
  enabled?: boolean;
  /** Ledger file path; defaults to `$DSH_HOME/usage-analytics/usage.sqlite`. */
  dbPath?: string;
  journalMode?: JournalMode;
  /** Batch writer flush interval in ms (0 = manual flush only). Default 1000. */
  flushIntervalMs?: number;
  flushBatchSize?: number;
  retention?: RetentionConfig;
  /** Retention sweep interval in ms (0 disables periodic sweeps). Default 6h. */
  retentionIntervalMs?: number;
}

/**
 * Plugin entry: wires the collector to the `session/event` firehose and the
 * ledger to the collector's records.
 *
 * Fail-open at every layer: if the ledger cannot open (bad path, foreign DB,
 * migration error), the plugin logs and keeps collecting — records are dropped
 * instead of breaking the agent. Write failures are contained by the batch
 * writer and logged via `onError`.
 */
export function apply(ctx: Context, config: UsageAnalyticsPluginConfig = {}): void {
  if (config.enabled === false) return;
  const logger = ctx.logger(name);

  let ledger: UsageLedger | undefined;
  try {
    ledger = UsageLedger.open({
      dbPath: config.dbPath ?? dshHomePath('usage-analytics', 'usage.sqlite'),
      journalMode: config.journalMode,
      flushIntervalMs: config.flushIntervalMs,
      flushBatchSize: config.flushBatchSize,
      retention: config.retention,
      retentionIntervalMs: config.retentionIntervalMs,
      onError: (error) => logger.error('usage-analytics ledger error (degraded)', error),
    });
  } catch (error) {
    logger.error('usage-analytics ledger unavailable; analytics degraded (fail-open)', error);
  }

  // Expose the query facade over Typert (packaged client half calls
  // ctx.remote.usageAnalytics.*). No ledger → no remote surface.
  if (ledger) {
    try {
      new UsageRemoteService(ctx, ledger.query());
    } catch (error) {
      logger.error('usage-analytics remote service unavailable (fail-open)', error);
    }
  }

  const collector = new UsageCollector({
    onRecord: (record) => ledger?.push(record),
    logger: {
      error: (message, ...args) => logger.error(message, ...args),
      debug: (message, ...args) => logger.debug(message, ...args),
    },
  });

  ctx.on('session/event', (session: Session, event) => {
    collector.ingest(session.id, event, { firstLiveSeq: session.firstLiveSeq });
  });
  ctx.on('session/disposed', (session: Session) => collector.sessionDisposed(session.id));
  ctx.effect(() => () => {
    collector.flush();
    ledger?.dispose();
  });
}
