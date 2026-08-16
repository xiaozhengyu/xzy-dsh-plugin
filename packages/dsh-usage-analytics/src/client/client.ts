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
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol';
import { Dashboard } from './Dashboard.js';
import { TYPERT_REMOTE } from './remote-contribution.js';
import type {} from './remote-namespace.js';

export const name = 'usage-analytics-client';

/**
 * Fiber-level service inject. The client module loader gates `apply` on these
 * being provided: `remote` (dsh-api-gateway's Typert client) and `slots`
 * (dsh-client-runtime's SlotRegistry). Declaring them also makes service
 * proxy reads legal wherever they happen.
 */
export const inject: string[] = ['remote', 'slots'];

export async function apply(ctx: Context): Promise<void> {
  // 1. Mount the remote contribution; keep the disposer for fiber cleanup.
  const remote = ctx.get('remote');
  let disposeMount: (() => Promise<void>) | undefined;
  if (remote) {
    try {
      disposeMount = await remote.$mount(TYPERT_REMOTE);
    } catch (error) {
      // fail-open: the dashboard renders an error state without the remote
      console.error('usage-analytics: remote mount failed (fail-open)', error);
    }
  }
  ctx.effect(() => () => {
    void disposeMount?.();
  });

  // The namespace service is provided under the dotted key `remote.usageAnalytics`
  // once the mount above settles. Capture it now: reading `ctx.remote` inside the
  // slot inject closure below would be an undeclared property read at render time.
  const usage = remote ? (ctx.get('remote.usageAnalytics') as TypertRemoteNamespaceMap['usageAnalytics'] | undefined) : undefined;

  // 2. Dashboard page in settings (root scope — no session kit, data via remote).
  const slots = ctx.get('slots');
  if (!slots) return;
  slots.inject('settings.section', () =>
    slots.register(
      {
        name: 'settings.section',
        id: 'usage-analytics',
        order: 20,
        label: () => '用量分析',
        inject: () => ({ usage }),
      },
      Dashboard,
    ),
  );
}
