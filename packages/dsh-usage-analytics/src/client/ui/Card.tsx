import React from 'react';
import { palette, radius, spacing } from './tokens.js';

interface CardProps {
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/** 区域容器：低边框、弱阴影、小圆角 —— 有边界但不喧宾夺主。 */
export function Card(props: CardProps): React.ReactElement {
  const { style, children } = props;
  return React.createElement(
    'div',
    {
      style: {
        background: palette.surface,
        border: `1px solid ${palette.borderSubtle}`,
        borderRadius: radius.md,
        padding: spacing.lg,
        ...style,
      },
    },
    children,
  );
}
