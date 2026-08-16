/**
 * Packaged client half entry (bundled to lib/client.js by scripts/bundle-client.mjs).
 *
 * Responsibilities:
 * 1. Register the `usageAnalytics` Typert remote contribution so
 *    `ctx.remote.usageAnalytics.*` is callable (harness-api.md §7.3).
 * 2. Register the Usage Analytics dashboard into the `settings.section` slot
 *    (root-scoped full page; the closest seat to a standalone dashboard —
 *    harness-api.md §7.2).
 */
import type {} from '@deepseek-ai/dsh-client-runtime/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-typert-protocol/types';
import type { Context } from '@deepseek-ai/cordis';
import { Dashboard } from './Dashboard.js';
import { TYPERT_REMOTE } from './remote-contribution.js';
import type {} from './remote-namespace.js';

export const name = 'usage-analytics-client';

export function apply(ctx: Context): void {
  // 1. Mount the remote contribution (fiber-owned: removed on unload).
  const typert = ctx.get('typert');
  if (typert) {
    typert.remotes.register(TYPERT_REMOTE);
  }

  // 2. Dashboard page in settings (root scope — no session kit, data via remote).
  const slots = ctx.get('slots');
  if (!slots) return;
  slots.inject('settings.section', () =>
    slots.register(
      {
        name: 'settings.section',
        id: 'usage-analytics',
        order: 20,
        label: () => 'Usage Analytics',
        inject: () => ({ usage: ctx.remote.usageAnalytics }),
      },
      Dashboard,
    ),
  );
}
