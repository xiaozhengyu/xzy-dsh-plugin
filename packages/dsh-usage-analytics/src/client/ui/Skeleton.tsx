import React from 'react';
import { palette, radius, spacing } from './tokens.js';

interface SkeletonProps {
  width?: number | string;
  height?: number;
}

export function Skeleton(props: SkeletonProps): React.ReactElement {
  const { width = '100%', height = 12 } = props;
  return React.createElement('div', {
    style: { width, height, borderRadius: radius.sm, background: palette.skeleton },
  });
}

/** KPI 行骨架：4 个等宽块。 */
export function KpiSkeleton(): React.ReactElement {
  return React.createElement(
    'div',
    { style: { display: 'flex', gap: spacing.md, flexWrap: 'wrap' } },
    [0, 1, 2, 3].map((i) =>
      React.createElement('div', { key: i, style: { flex: 1, minWidth: 120, padding: spacing.md, borderRadius: radius.md, background: palette.skeleton } },
        React.createElement(Skeleton, { width: '40%', height: 10 }),
        React.createElement('div', { style: { marginTop: spacing.sm } },
          React.createElement(Skeleton, { width: '70%', height: 20 }),
        ),
      ),
    ),
  );
}

/** 趋势图骨架。 */
export function ChartSkeleton(): React.ReactElement {
  return React.createElement(Skeleton, { height: 160 });
}

/** 列表骨架。 */
export function ListSkeleton(props: { rows?: number }): React.ReactElement {
  const { rows = 5 } = props;
  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: spacing.md } },
    Array.from({ length: rows }, (_, i) =>
      React.createElement('div', { key: i, style: { display: 'flex', gap: spacing.md, alignItems: 'center' } },
        React.createElement(Skeleton, { width: 90, height: 12 }),
        React.createElement(Skeleton, { width: '100%', height: 12 }),
        React.createElement(Skeleton, { width: 80, height: 12 }),
      ),
    ),
  );
}
