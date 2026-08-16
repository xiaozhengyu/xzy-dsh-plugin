import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import { UsageCollector } from '../collector/UsageCollector.js';

/** Cordis plugin name (also the patch-row id convention in cordis.patch.yml). */
export const name = 'usage-analytics';

export interface UsageAnalyticsPluginConfig {
  /** Set false to mount the plugin as a no-op. */
  enabled?: boolean;
}

/**
 * Phase 1 plugin entry: wires the collector to the `session/event` firehose.
 *
 * Fail-open: the collector never throws; listener failures are logged by
 * DSH's own containment and never propagate into the session append path.
 */
export function apply(ctx: Context, config: UsageAnalyticsPluginConfig = {}): void {
  if (config.enabled === false) return;
  const logger = ctx.logger(name);
  const collector = new UsageCollector({
    logger: {
      error: (message, ...args) => logger.error(message, ...args),
      debug: (message, ...args) => logger.debug(message, ...args),
    },
  });

  ctx.on('session/event', (session: Session, event) => {
    collector.ingest(session.id, event, { firstLiveSeq: session.firstLiveSeq });
  });
  ctx.on('session/disposed', (session: Session) => collector.sessionDisposed(session.id));
  ctx.effect(() => () => collector.flush());
}
