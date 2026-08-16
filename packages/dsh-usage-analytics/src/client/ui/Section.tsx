import React from 'react';
import { font, palette, spacing } from './tokens.js';

interface SectionProps {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function Section(props: SectionProps): React.ReactElement {
  const { title, action, children } = props;
  return React.createElement(
    'div',
    { style: { marginTop: spacing.xl } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md } },
      React.createElement('div', { style: { fontSize: font.cardTitle, fontWeight: 600, color: palette.labelPrimary } }, title),
      action ?? null,
    ),
    children,
  );
}
