'use client';

import type { ReactNode } from 'react';

/**
 * Loose shape of what Recharts passes to a custom tooltip. Recharts' own
 * generics are wider than what we read, so every field stays optional and
 * `unknown` where we coerce it.
 */
export interface RechartsTooltipProps<T = unknown> {
  active?: boolean;
  label?: unknown;
  payload?: { value?: unknown; dataKey?: unknown; payload?: T }[];
}

/** Shared dark tooltip body, matching the PolicyEngine chart house style. */
export default function ChartTooltip({
  title,
  rows,
}: {
  title: ReactNode;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{title}</p>
      {rows.map((row) => (
        <p className="chart-tooltip-row" key={row.label}>
          {row.color ? (
            <span className="chart-tooltip-dot" style={{ background: row.color }} />
          ) : null}
          <span className="chart-tooltip-label">{row.label}</span>
          <span className="chart-tooltip-value">{row.value}</span>
        </p>
      ))}
    </div>
  );
}
