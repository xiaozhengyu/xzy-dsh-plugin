/**
 * Packaged client half entry (bundled to lib/client.js by scripts/bundle-client.mjs).
 *
 * Responsibilities:
 * 1. Mount the `usageAnalytics` Typert remote contribution via
 *    `ctx.remote.$mount(TYPERT_REMOTE)` so `ctx.remote.usageAnalytics.*` is
 *    callable (mount installs the concrete namespace methods + the
 *    `remote.usageAnalytics` service — verified pattern from dsh-api-remotes).
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

export async function apply(ctx: Context): Promise<void> {
  // 1. Mount the remote contribution (fiber-owned: disposed on unload).
  const remote = ctx.get('remote');
  if (remote) {
    try {
      await remote.$mount(TYPERT_REMOTE);
    } catch (error) {
      // fail-open: the dashboard renders an error state without the remote
      console.error('usage-analytics: remote mount failed (fail-open)', error);
    }
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
        inject: () => ({ usage: ctx.remote?.usageAnalytics }),
      },
      Dashboard,
    ),
  );
}
