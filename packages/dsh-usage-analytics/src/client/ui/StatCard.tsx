import React from 'react';
import { font, palette, radius, spacing } from './tokens.js';

interface StatCardProps {
  label: string;
  value: string;
  /** 强调值（第一层 KPI）；默认 true。 */
  emphasized?: boolean;
}

export function StatCard(props: StatCardProps): React.ReactElement {
  const { label, value, emphasized = true } = props;
  return React.createElement(
    'div',
    {
      style: {
        flex: 1,
        minWidth: 120,
        background: palette.surface,
        border: `1px solid ${palette.borderSubtle}`,
        borderRadius: radius.md,
        padding: `${spacing.md}px ${spacing.lg}px`,
      },
    },
    React.createElement('div', { style: { fontSize: font.label, color: palette.labelSecondary, marginBottom: spacing.xs } }, label),
    React.createElement(
      'div',
      {
        style: {
          fontSize: emphasized ? font.primaryValue : font.secondaryValue,
          fontWeight: emphasized ? 600 : 500,
          color: palette.labelPrimary,
          fontVariantNumeric: 'tabular-nums',
        },
      },
      value,
    ),
  );
}
