/**
 * Packaged client half entry (bundled to lib/client.js by scripts/bundle-client.mjs).
 *
 * Responsibilities:
 * 1. Mount the `usageAnalytics` Typert remote contribution via
 *    `ctx.remote.$mount(TYPERT_REMOTE)` so `ctx.remote.usageAnalytics.*` is
 *    callable (mount installs the concrete namespace methods + the
 *    `remote.usageAnalytics` service — verified pattern from dsh-api-remotes).
 * 2. Register the sidebar footer button (`sidebar.footer.action`) that opens
 *    the full-screen usage dialog (`shell.overlay`) — the single entry point
 *    for 用量分析.
 */
import type {} from '@deepseek-ai/dsh-client-runtime/client';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-typert-protocol/types';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type { Context } from '@deepseek-ai/cordis';
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol';
import { SidebarUsageButton } from './SidebarUsageButton.js';
import { UsageOverlay } from './UsageOverlay.js';
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

  // 2. Sidebar footer button (list slot; rendered above the settings gear).
  const slots = ctx.get('slots');
  if (!slots) return;
  slots.inject('sidebar.footer.action', () =>
    slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'usage-analytics-open',
        order: 0,
      },
      SidebarUsageButton,
    ),
  );

  // 3. Full-screen usage dialog (root-scope floating layer; renders null when closed).
  slots.inject('shell.overlay', () =>
    slots.register(
      {
        name: 'shell.overlay',
        id: 'usage-analytics-overlay',
        order: 100,
        inject: () => ({ usage }),
      },
      UsageOverlay,
    ),
  );
}
