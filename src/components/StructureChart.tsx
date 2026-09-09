'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartTooltip, { type RechartsTooltipProps } from './ChartTooltip';
import { fmtCurrency, fmtCurrencyCompact } from '@/lib/format';
import { niceTicks } from '@/lib/niceTicks';

export interface StructureDatum {
  childKey: string;
  label: string;
  subsidy: number;
}

const SHORT_LABELS: Record<string, string> = {
  infant: 'Infant',
  preschool: 'Preschooler',
  school: 'School age',
  two: 'Two children',
  three: 'Three children',
};

export default function StructureChart({
  data,
  highlight,
}: {
  data: StructureDatum[];
  highlight: string;
}) {
  const rows = useMemo(
    () => data.map((row) => ({ ...row, short: SHORT_LABELS[row.childKey] ?? row.childKey })),
    [data],
  );
  const ticks = useMemo(
    () => niceTicks(rows.reduce((acc, row) => Math.max(acc, row.subsidy), 0)),
    [rows],
  );

  const renderTooltip = ({ active, payload }: RechartsTooltipProps<StructureDatum>) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0].payload;
    if (!row) return null;
    return (
      <ChartTooltip
        title={row.label}
        rows={[{ label: 'State pays', value: `${fmtCurrency(row.subsidy)}/mo` }]}
      />
    );
  };

  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="short"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, ticks[ticks.length - 1]]}
            ticks={ticks}
            tickFormatter={fmtCurrencyCompact}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={{ stroke: 'var(--border)' }}
          />
          <Tooltip
            content={renderTooltip}
            separator=": "
            cursor={{ fill: 'var(--muted)' }}
          />
          <Bar dataKey="subsidy" radius={[4, 4, 0, 0]}>
            {rows.map((row) => (
              <Cell
                key={row.childKey}
                fill={row.childKey === highlight ? 'var(--chart-1)' : 'var(--chart-3)'}
                opacity={row.childKey === highlight ? 1 : 0.55}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
