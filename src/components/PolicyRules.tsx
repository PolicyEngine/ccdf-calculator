'use client';

import { useMemo, useState } from 'react';
import { cleanLabel, fmtCurrency } from '@/lib/format';
import type { PolicyParameter, PolicyValue, StatePolicy } from '@/lib/types';

function formatScalar(value: PolicyValue | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined) return '—';
  // Unbounded bracket edges come through as +/- infinity (see dataLookup).
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return value > 0 ? 'No limit' : 'No floor';
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).replaceAll('_', ' ')).join(', ') || '—';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value.replaceAll('_', ' ');
  switch (unit) {
    case '/1':
      return `${(value * 100).toFixed(value * 100 < 10 ? 1 : 0)}%`;
    case 'currency-USD':
      return fmtCurrency(value);
    case 'year':
      return `${value} ${value === 1 ? 'year' : 'years'}`;
    case 'month':
      return `${value} ${value === 1 ? 'month' : 'months'}`;
    case 'week':
      return `${value} ${value === 1 ? 'week' : 'weeks'}`;
    case 'day':
      return `${value} ${value === 1 ? 'day' : 'days'}`;
    case 'hour':
      return `${value} ${value === 1 ? 'hour' : 'hours'}`;
    case 'person':
      return `${value} ${value === 1 ? 'person' : 'people'}`;
    default:
      return value.toLocaleString('en-US');
  }
}

/**
 * The top edge of an open-ended bracket. `policy_index.json` is strict JSON,
 * so it writes `null`; older files wrote Python's bare `Infinity`, which
 * `dataLookup` revives as a JS infinity. Both mean "no limit".
 */
function formatThreshold(threshold: number | null | undefined): string {
  if (threshold === null || threshold === undefined) return 'No limit';
  if (!Number.isFinite(threshold)) return threshold > 0 ? 'No limit' : 'Any';
  return threshold.toLocaleString('en-US');
}

/** Latest dated value in the file, with the date it takes effect. */
function currentValue(parameter: PolicyParameter): { date: string; value: PolicyValue } | null {
  const entries = Object.entries(parameter.values ?? {});
  if (entries.length === 0) return null;
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const [date, value] = entries[entries.length - 1];
  return { date, value };
}

function ParameterRow({ parameter, stateName }: { parameter: PolicyParameter; stateName: string }) {
  const current = currentValue(parameter);
  return (
    <li className="parameter">
      <div className="parameter-head">
        <span className="parameter-label">{cleanLabel(parameter.label, stateName)}</span>
        {current ? (
          <span className="parameter-value">{formatScalar(current.value, parameter.unit)}</span>
        ) : null}
      </div>
      {parameter.description ? (
        <p className="parameter-description">{parameter.description}</p>
      ) : null}
      {parameter.scale ? (
        <table className="scale-table">
          <thead>
            <tr>
              <th scope="col">Threshold</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {parameter.scale.map((bracket, index) => (
              <tr key={`${bracket.threshold}-${bracket.amount ?? bracket.rate}-${index}`}>
                <td>{formatThreshold(bracket.threshold)}</td>
                <td>{formatScalar(bracket.amount ?? bracket.rate, parameter.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="parameter-meta">
        <code>{parameter.path}</code>
        {(parameter.references ?? []).map((reference) => (
          <a key={reference.href} href={reference.href} target="_blank" rel="noreferrer">
            {reference.title}
          </a>
        ))}
      </p>
    </li>
  );
}

export default function PolicyRules({ policy }: { policy: StatePolicy | null }) {
  const [query, setQuery] = useState('');

  const parameters = useMemo(() => {
    if (!policy) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return policy.parameters;
    return policy.parameters.filter(
      (parameter) =>
        parameter.label.toLowerCase().includes(needle) ||
        parameter.path.toLowerCase().includes(needle),
    );
  }, [policy, query]);

  if (!policy) return null;

  return (
    <details className="policy-rules">
      <summary>
        Program rules as encoded — {policy.name}: {policy.program} (
        {policy.parameters.length} parameters)
      </summary>
      <p className="chart-subtitle">
        Parameters under <code>{policy.parameter_root}</code>, with the source each value comes
        from.
      </p>
      <div className="form-group">
        <label htmlFor="parameter-search">Filter parameters</label>
        <input
          id="parameter-search"
          type="text"
          value={query}
          placeholder="Copay, age limit, rate…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <ul className="parameter-list">
        {parameters.map((parameter) => (
          <ParameterRow key={parameter.path} parameter={parameter} stateName={policy.name} />
        ))}
      </ul>
      {parameters.length === 0 ? <p className="ranking-empty">No matching parameters.</p> : null}
    </details>
  );
}
