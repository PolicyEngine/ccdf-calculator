'use client';

import { useMemo, useState } from 'react';
import type { StateComparisonRow } from '@/lib/dataLookup';
import { fmtCurrency, fmtPercent } from '@/lib/format';

type ColumnId = 'name' | 'program' | 'subsidy' | 'copay' | 'cutoff' | 'fpg' | 'smi';

const COLUMNS: { id: ColumnId; label: string; numeric: boolean }[] = [
  { id: 'name', label: 'State', numeric: false },
  { id: 'program', label: 'Program', numeric: false },
  { id: 'subsidy', label: 'Monthly subsidy', numeric: true },
  { id: 'copay', label: 'Monthly copay', numeric: true },
  { id: 'cutoff', label: 'Income cutoff', numeric: true },
  { id: 'fpg', label: 'Cutoff, % of poverty line', numeric: true },
  { id: 'smi', label: 'Cutoff, % of state median', numeric: true },
];

function sortValue(row: StateComparisonRow, column: ColumnId): number | string {
  switch (column) {
    case 'name':
      return row.name;
    case 'program':
      return row.program;
    case 'subsidy':
      return row.subsidy ?? -1;
    case 'copay':
      return row.copay ?? -1;
    case 'cutoff':
      return row.cutoffIncome ?? -1;
    case 'fpg':
      return row.cutoffShareOfFpg ?? -1;
    case 'smi':
      return row.cutoffShareOfSmi ?? -1;
    default:
      return 0;
  }
}

export default function ComparisonTable({
  rows,
  selectedState,
  onSelect,
}: {
  rows: StateComparisonRow[];
  selectedState: string;
  onSelect: (code: string) => void;
}) {
  const [column, setColumn] = useState<ColumnId>('subsidy');
  const [descending, setDescending] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const left = sortValue(a, column);
      const right = sortValue(b, column);
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left).localeCompare(String(right)) * (descending ? -1 : 1);
      }
      return (left - right) * (descending ? -1 : 1);
    });
    return copy;
  }, [rows, column, descending]);

  const toggle = (id: ColumnId) => {
    if (id === column) setDescending(!descending);
    else {
      setColumn(id);
      setDescending(id !== 'name' && id !== 'program');
    }
  };

  const cutoffText = (row: StateComparisonRow) => {
    if (row.cutoffIncome === null) return 'Never eligible';
    if (row.cutoffBeyondAxis) return 'Above $200,000';
    return fmtCurrency(row.cutoffIncome);
  };

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.id} className={col.numeric ? 'numeric' : ''} scope="col">
                <button
                  type="button"
                  className={`sort-btn ${column === col.id ? 'active' : ''}`}
                  onClick={() => toggle(col.id)}
                  aria-label={`Sort by ${col.label.toLowerCase()}`}
                >
                  {col.label}
                  {column === col.id ? <span aria-hidden>{descending ? ' ↓' : ' ↑'}</span> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.code}
              className={row.code === selectedState ? 'selected' : ''}
              onClick={() => onSelect(row.code)}
            >
              <th scope="row">{row.name}</th>
              <td>{row.program}</td>
              <td className="numeric">
                {row.subsidy === null ? '—' : fmtCurrency(row.subsidy)}
              </td>
              <td className="numeric">{row.copay === null ? '—' : fmtCurrency(row.copay)}</td>
              <td className="numeric">{cutoffText(row)}</td>
              <td className="numeric">
                {row.cutoffShareOfFpg === null ? '—' : fmtPercent(row.cutoffShareOfFpg, 0)}
              </td>
              <td className="numeric">
                {row.cutoffShareOfSmi === null ? '—' : fmtPercent(row.cutoffShareOfSmi, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
