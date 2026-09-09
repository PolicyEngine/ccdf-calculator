'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartTooltip, { type RechartsTooltipProps } from './ChartTooltip';
import type { ChartPoint } from '@/lib/dataLookup';
import { fmtCurrency, fmtCurrencyCompact } from '@/lib/format';
import { niceTicks } from '@/lib/niceTicks';

const AXIS_TICK = { fill: 'var(--color-text-muted)', fontSize: 11 };
const AXIS_LINE = { stroke: 'var(--border)' };

interface Props {
  data: ChartPoint[];
  income: number;
}

export default function SubsidyChart({ data, income }: Props) {
  const yTicks = useMemo(() => {
    const max = data.reduce((acc, point) => Math.max(acc, point.subsidy, point.copay), 0);
    return niceTicks(max);
  }, [data]);
  const xTicks = useMemo(() => {
    const max = data.length > 0 ? data[data.length - 1].income : 0;
    return niceTicks(max);
  }, [data]);

  const renderTooltip = ({ active, label, payload }: RechartsTooltipProps) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <ChartTooltip
        title={`${fmtCurrency(Number(label))} a year`}
        rows={payload.map((item) => ({
          label: item.dataKey === 'subsidy' ? 'State pays' : 'Family copay',
          value: `${fmtCurrency(Number(item.value ?? 0))}/mo`,
          color: item.dataKey === 'subsidy' ? 'var(--chart-1)' : 'var(--chart-2)',
        }))}
      />
    );
  };

  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 24, left: 10, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="income"
            type="number"
            domain={[0, xTicks[xTicks.length - 1]]}
            ticks={xTicks}
            tickFormatter={fmtCurrencyCompact}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={AXIS_LINE}
            label={{
              value: 'Annual earned income',
              position: 'bottom',
              offset: 4,
              fill: 'var(--color-text-muted)',
              fontSize: 11,
            }}
          />
          <YAxis
            domain={[0, yTicks[yTicks.length - 1]]}
            ticks={yTicks}
            tickFormatter={fmtCurrencyCompact}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={AXIS_LINE}
            label={{
              value: 'Dollars per month',
              angle: -90,
              position: 'insideLeft',
              dx: -4,
              style: { textAnchor: 'middle', fill: 'var(--color-text-muted)', fontSize: 11 },
            }}
          />
          <Tooltip content={renderTooltip} separator=": " />
          <Legend verticalAlign="top" height={28} iconType="plainline" />
          <ReferenceLine
            x={income}
            stroke="var(--chart-5)"
            strokeDasharray="4 4"
            label={{
              value: 'Your income',
              position: 'top',
              fill: 'var(--color-text-muted)',
              fontSize: 11,
            }}
          />
          <Line
            type="monotone"
            name="State pays"
            dataKey="subsidy"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type="monotone"
            name="Family copay"
            dataKey="copay"
            stroke="var(--chart-2)"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
