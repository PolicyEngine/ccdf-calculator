'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartTooltip, { type RechartsTooltipProps } from './ChartTooltip';
import { niceTicks } from '@/lib/niceTicks';

export interface RankingRow {
  code: string;
  name: string;
  program: string;
  value: number;
  note?: string;
}

const COLLAPSED = 12;

export default function RankingChart({
  rows,
  selectedState,
  onSelect,
  formatValue,
}: {
  rows: RankingRow[];
  selectedState: string;
  onSelect: (code: string) => void;
  formatValue: (value: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, COLLAPSED);
  const ticks = useMemo(
    () => niceTicks(rows.reduce((acc, row) => Math.max(acc, row.value), 0)),
    [rows],
  );

  const renderTooltip = ({ active, payload }: RechartsTooltipProps<RankingRow>) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0].payload;
    if (!row) return null;
    return (
      <ChartTooltip
        title={row.name}
        rows={[
          { label: row.program, value: formatValue(row.value) },
          ...(row.note ? [{ label: 'Note', value: row.note }] : []),
        ]}
      />
    );
  };

  if (rows.length === 0) {
    return <p className="ranking-empty">No states have a value for this metric.</p>;
  }

  return (
    <div className="state-ranking">
      <div className="ranking-chart">
        <ResponsiveContainer width="100%" height={Math.max(240, shown.length * 26)}>
          <BarChart
            data={shown}
            layout="vertical"
            margin={{ top: 5, right: 40, left: 8, bottom: 5 }}
            barCategoryGap={4}
          >
            <XAxis
              type="number"
              domain={[0, ticks[ticks.length - 1]]}
              ticks={ticks}
              tickFormatter={formatValue}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              type="category"
              dataKey="code"
              tick={{ fill: 'var(--color-navy)', fontSize: 11, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={renderTooltip} separator=": " cursor={{ fill: 'var(--muted)' }} />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              onClick={(entry: unknown) => {
                const row = entry as RankingRow;
                if (row?.code) onSelect(row.code);
              }}
              style={{ cursor: 'pointer' }}
            >
              {shown.map((row) => (
                <Cell
                  key={row.code}
                  fill={row.code === selectedState ? 'var(--chart-2)' : 'var(--chart-1)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="ranking-footer">
        {rows.length > COLLAPSED ? (
          <button type="button" className="expand-btn" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show the top 12' : `Show all ${rows.length} states`}
          </button>
        ) : null}
        <p>Select a bar to open that state in the calculator.</p>
      </div>
    </div>
  );
}
