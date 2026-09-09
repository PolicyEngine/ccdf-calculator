'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppFooter from './AppFooter';
import ComparisonTable from './ComparisonTable';
import PolicyRules from './PolicyRules';
import RankingChart, { type RankingRow } from './RankingChart';
import StateMap from './StateMap';
import TabNav from './TabNav';
import {
  CHILD_STRUCTURE_LABELS,
  compareStates,
  loadMetadata,
  loadPolicyIndex,
  structureKey,
  type StateComparisonRow,
} from '@/lib/dataLookup';
import { fmtCurrency, fmtPercent } from '@/lib/format';
import type { Metadata, PolicyIndex } from '@/lib/types';

type MetricId = 'subsidy' | 'copay' | 'cutoff' | 'cutoff_fpg' | 'cutoff_smi';

interface MetricDefinition {
  id: MetricId;
  label: string;
  get: (row: StateComparisonRow) => number | null;
  format: (value: number) => string;
  lowLabel: string;
  highLabel: string;
}

const METRICS: MetricDefinition[] = [
  {
    id: 'subsidy',
    label: 'Monthly subsidy',
    get: (row) => row.subsidy,
    format: fmtCurrency,
    lowLabel: 'Smaller subsidy',
    highLabel: 'Larger subsidy',
  },
  {
    id: 'copay',
    label: 'Monthly copay',
    get: (row) => row.copay,
    format: fmtCurrency,
    lowLabel: 'Smaller copay',
    highLabel: 'Larger copay',
  },
  {
    id: 'cutoff',
    label: 'Income cutoff',
    get: (row) => row.cutoffIncome,
    format: fmtCurrency,
    lowLabel: 'Lower cutoff',
    highLabel: 'Higher cutoff',
  },
  {
    id: 'cutoff_fpg',
    label: 'Cutoff as a share of the poverty line',
    get: (row) => row.cutoffShareOfFpg,
    format: (value) => fmtPercent(value, 0),
    lowLabel: 'Lower cutoff',
    highLabel: 'Higher cutoff',
  },
  {
    id: 'cutoff_smi',
    label: 'Cutoff as a share of state median income',
    get: (row) => row.cutoffShareOfSmi,
    format: (value) => fmtPercent(value, 0),
    lowLabel: 'Lower cutoff',
    highLabel: 'Higher cutoff',
  },
];

export default function Compare() {
  const router = useRouter();
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [policy, setPolicy] = useState<PolicyIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [adults, setAdults] = useState(1);
  const [childKey, setChildKey] = useState('two');
  const [income, setIncome] = useState(30000);
  const [chargeIndex, setChargeIndex] = useState(1);
  const [metricId, setMetricId] = useState<MetricId>('subsidy');
  const [focusState, setFocusState] = useState('CA');

  const [rows, setRows] = useState<StateComparisonRow[] | null>(null);
  // Signature of the cell `rows` was computed for; anything else means the
  // comparison is still catching up with the controls.
  const [rowsSignature, setRowsSignature] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadMetadata(), loadPolicyIndex()])
      .then(([meta, index]) => {
        setMetadata(meta);
        setPolicy(index);
        setChargeIndex(meta.default_charge_index);
      })
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  const key = structureKey(adults, childKey);
  const signature = `${key}|${chargeIndex}|${income}`;

  useEffect(() => {
    if (!metadata || !policy) return;
    let cancelled = false;
    compareStates(metadata, policy, key, chargeIndex, income)
      .then((result) => {
        if (cancelled) return;
        setRows(result);
        setRowsSignature(signature);
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [metadata, policy, key, chargeIndex, income, signature]);

  const comparing = rowsSignature !== signature;

  const metric = METRICS.find((item) => item.id === metricId) ?? METRICS[0];

  const values = useMemo(() => {
    const map: Record<string, number | null> = {};
    (rows ?? []).forEach((row) => {
      map[row.code] = metric.get(row);
    });
    return map;
  }, [rows, metric]);

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    (rows ?? []).forEach((row) => {
      map[row.code] = row.name;
    });
    return map;
  }, [rows]);

  const programs = useMemo(() => {
    const map: Record<string, string> = {};
    (rows ?? []).forEach((row) => {
      map[row.code] = row.program;
    });
    return map;
  }, [rows]);

  const rankingRows: RankingRow[] = useMemo(() => {
    const showsCutoff = metricId !== 'subsidy' && metricId !== 'copay';
    const collected: RankingRow[] = [];
    (rows ?? []).forEach((row) => {
      const value = metric.get(row);
      if (value === null) return;
      collected.push({
        code: row.code,
        name: row.name,
        program: row.program,
        value,
        note:
          row.cutoffBeyondAxis && showsCutoff
            ? 'Still paying at the top of the modeled income range'
            : undefined,
      });
    });
    collected.sort((a, b) => b.value - a.value);
    return collected;
  }, [rows, metric, metricId]);

  const beyondAxis = useMemo(
    () => (rows ?? []).filter((row) => row.cutoffBeyondAxis).map((row) => row.name),
    [rows],
  );

  const goToCalculator = (code: string) => {
    router.push(`/?state=${code}`);
  };

  if (loadError) {
    return (
      <div className="app">
        <div className="error">{loadError}</div>
      </div>
    );
  }

  if (!metadata || !policy) {
    return (
      <div className="app">
        <div className="loading">Loading state comparison…</div>
      </div>
    );
  }

  const maxIncome = metadata.income_steps[metadata.income_steps.length - 1];

  return (
    <div className="app">
      <header className="app-header">
        <h1>Compare states</h1>
        <p>One reference family, 51 child care subsidy programs</p>
      </header>

      <TabNav />

      <main>
        <div className="stack">
          <section className="input-panel">
            <h2>Reference family</h2>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="compare-adults">Adults</label>
                <select
                  id="compare-adults"
                  value={adults}
                  onChange={(event) => setAdults(Number(event.target.value))}
                >
                  <option value={1}>1 adult</option>
                  <option value={2}>2 adults</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="compare-structure">Children</label>
                <select
                  id="compare-structure"
                  value={childKey}
                  onChange={(event) => setChildKey(event.target.value)}
                >
                  {Object.keys(metadata.child_structures).map((option) => (
                    <option key={option} value={option}>
                      {CHILD_STRUCTURE_LABELS[option] ?? option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="compare-charge">Provider charge per child</label>
                <select
                  id="compare-charge"
                  value={chargeIndex}
                  onChange={(event) => setChargeIndex(Number(event.target.value))}
                >
                  {metadata.charge_levels.map((level, index) => (
                    <option key={level} value={index}>
                      {fmtCurrency(level)} a month
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="compare-income">
                  Annual earned income: {fmtCurrency(income)}
                </label>
                <input
                  id="compare-income"
                  type="range"
                  className="range-input"
                  min={0}
                  max={maxIncome}
                  step={1000}
                  value={income}
                  onChange={(event) => setIncome(Number(event.target.value))}
                />
              </div>

              <div className="form-group">
                <label htmlFor="compare-metric">Metric</label>
                <select
                  id="compare-metric"
                  value={metricId}
                  onChange={(event) => setMetricId(event.target.value as MetricId)}
                >
                  {METRICS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="compare-focus">State for the rules below</label>
                <select
                  id="compare-focus"
                  value={focusState}
                  onChange={(event) => setFocusState(event.target.value)}
                >
                  {metadata.states.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {metricId === 'subsidy' || metricId === 'copay' ? (
              <p className="field-note">
                Values are monthly, at {fmtCurrency(income)} of annual earned income.
              </p>
            ) : (
              <p className="field-note">
                Cutoffs are the highest annual earned income at which the model still pays a
                subsidy, computed at the default provider charge.
              </p>
            )}
          </section>

          <section className="results-panel">
            <h2>{metric.label} by state</h2>
            {comparing && !rows ? <div className="loading">Loading all 51 states…</div> : null}
            {rows ? (
              <>
                <StateMap
                  values={values}
                  names={names}
                  subtitles={programs}
                  selectedState={focusState}
                  onSelect={goToCalculator}
                  formatValue={metric.format}
                  lowLabel={metric.lowLabel}
                  highLabel={metric.highLabel}
                />
                <p className="field-note">
                  Select a state on the map to open it in the calculator. The District of
                  Columbia appears in the ranking and the table.
                </p>
              </>
            ) : null}
          </section>

          {rows ? (
            <section className="results-panel">
              <h2>Ranked by {metric.label.toLowerCase()}</h2>
              <RankingChart
                rows={rankingRows}
                selectedState={focusState}
                onSelect={goToCalculator}
                formatValue={metric.format}
              />
            </section>
          ) : null}

          {rows ? (
            <section className="results-panel">
              <h2>All states</h2>
              <p className="chart-subtitle">
                {CHILD_STRUCTURE_LABELS[childKey]}, {adults}{' '}
                {adults === 1 ? 'adult' : 'adults'}, {fmtCurrency(income)} of earnings, a{' '}
                {fmtCurrency(metadata.charge_levels[chargeIndex])} monthly charge per child.
                Select a row to load its encoded rules below.
              </p>
              <ComparisonTable
                rows={rows}
                selectedState={focusState}
                onSelect={setFocusState}
              />
              {beyondAxis.length > 0 ? (
                <p className="field-note">
                  {beyondAxis.join(', ')} still {beyondAxis.length === 1 ? 'pays' : 'pay'} a
                  subsidy at {fmtCurrency(maxIncome)}, the top of the modeled income range, so
                  the cutoff is shown as above that amount rather than as a finite limit.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="results-panel">
            <PolicyRules policy={policy.states[focusState] ?? null} />
          </section>
        </div>
      </main>

      <AppFooter metadata={metadata} />
    </div>
  );
}
