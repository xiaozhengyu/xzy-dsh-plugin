/**
 * 全屏用量弹窗的开关状态（模块级单例）。
 * 侧栏按钮写入，`shell.overlay` 中的弹窗组件订阅。
 */
let open = false;
const listeners = new Set<() => void>();

export function isUsageOverlayOpen(): boolean {
  return open;
}

export function setUsageOverlayOpen(value: boolean): void {
  if (open === value) return;
  open = value;
  for (const listener of [...listeners]) listener();
}

export function openUsageOverlay(): void {
  setUsageOverlayOpen(true);
}

export function subscribeUsageOverlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
