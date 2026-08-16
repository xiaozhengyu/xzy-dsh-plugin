/**
 * 轻量设计令牌：统一 spacing / radius / typography / 语义色。
 * 颜色优先走 Harness 主题变量（--dsw-alias-*），回退到 --theme-*，最后 hex。
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

export const font = {
  pageTitle: 16,
  cardTitle: 14,
  primaryValue: 22,
  secondaryValue: 14,
  body: 13,
  label: 12,
  caption: 11,
} as const;

export const palette = {
  labelPrimary: 'var(--dsw-alias-label-primary, var(--theme-text, #e8e8e8))',
  labelSecondary: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.72))',
  labelTertiary: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,0.5))',
  surface: 'var(--dsw-alias-bg-layer-2, var(--theme-surface, rgba(127,127,127,0.08)))',
  surfaceSubtle: 'var(--dsw-alias-bg-layer-1, transparent)',
  border: 'var(--dsw-alias-border-l2, var(--theme-border, rgba(127,127,127,0.25)))',
  borderSubtle: 'var(--dsw-alias-border-l3, rgba(127,127,127,0.15))',
  primary: 'var(--dsw-alias-brand-primary, var(--theme-primary, rgba(120,160,255,0.8)))',
  success: 'var(--dsw-alias-state-success-primary, #3fb950)',
  error: 'var(--dsw-alias-state-error-primary, #e5534b)',
  warn: 'var(--dsw-alias-state-warn-primary, #d29922)',
  danger: 'var(--dsw-alias-state-error-primary, #e5534b)',
  skeleton: 'rgba(127,127,127,0.15)',
  mask: 'rgba(0,0,0,0.45)',
} as const;
