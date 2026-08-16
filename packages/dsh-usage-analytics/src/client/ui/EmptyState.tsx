import React from 'react';
import { font, palette, spacing } from './tokens.js';

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState(props: EmptyStateProps): React.ReactElement {
  const { title, description } = props;
  return React.createElement(
    'div',
    { style: { textAlign: 'center', padding: '40px 16px', color: palette.labelTertiary } },
    React.createElement(
      'svg',
      { width: 32, height: 32, viewBox: '0 0 16 16', fill: 'currentColor', style: { opacity: 0.6, marginBottom: spacing.sm } },
      React.createElement('rect', { x: 2, y: 9, width: 3, height: 5, rx: 1 }),
      React.createElement('rect', { x: 6.5, y: 5, width: 3, height: 9, rx: 1 }),
      React.createElement('rect', { x: 11, y: 2, width: 3, height: 12, rx: 1 }),
    ),
    React.createElement('div', { style: { fontSize: font.body, fontWeight: 600, color: palette.labelSecondary, marginBottom: spacing.xs } }, title),
    description ? React.createElement('div', { style: { fontSize: font.label } }, description) : null,
  );
}
