'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppFooter from './AppFooter';
import RankingChart, { type RankingRow } from './RankingChart';
import StateMap from './StateMap';
import TabNav from './TabNav';
import { loadImpact, loadMetadata } from '@/lib/dataLookup';
import { fmtCount, fmtCurrencyCompact, fmtPercent } from '@/lib/format';
import type { ImpactFile, ImpactPaidCare, ImpactStateRow, Metadata } from '@/lib/types';

/** Columns of the headline eligible-population table. */
type HeadlineMetricId =
  | 'eligible_share'
  | 'eligible_children'
  | 'eligible_families'
  | 'children_under_13'
  | 'potential_annual_subsidy';

/** Columns of the secondary paid-care table. */
type PaidCareMetricId =
  | 'children_in_paid_care'
  | 'eligible_children'
  | 'eligible_families'
  | 'annual_subsidy'
  | 'sample_units';

interface Column<Id extends string> {
  id: Id;
  label: string;
  format: (value: number) => string;
}

const HEADLINE_COLUMNS: Column<HeadlineMetricId>[] = [
  { id: 'eligible_share', label: 'Share of children under 13 eligible', format: (v) => fmtPercent(v, 1) },
  { id: 'eligible_children', label: 'Eligible children', format: fmtCount },
  { id: 'eligible_families', label: 'Eligible families', format: fmtCount },
  { id: 'children_under_13', label: 'Children under 13', format: fmtCount },
  { id: 'potential_annual_subsidy', label: 'Potential annual subsidy', format: fmtCurrencyCompact },
];

/** Metrics offered as the map and ranking colour, in that order. */
const MAP_METRIC_IDS: HeadlineMetricId[] = [
  'eligible_share',
  'eligible_children',
  'potential_annual_subsidy',
];

const PAID_CARE_COLUMNS: Column<PaidCareMetricId>[] = [
  { id: 'children_in_paid_care', label: 'Children in paid care', format: fmtCount },
  { id: 'eligible_children', label: 'Eligible children', format: fmtCount },
  { id: 'eligible_families', label: 'Eligible families', format: fmtCount },
  { id: 'annual_subsidy', label: 'Potential annual subsidy', format: fmtCurrencyCompact },
  { id: 'sample_units', label: 'Sampled families', format: fmtCount },
];

const PLANNED_ASSUMPTIONS = [
  'Every child under 13 is assumed to be in full-time care (8 hours a day under 5, 3 hours a day at 5 to 12, 5 days a week, 22 days a month) at the assumed charge per child.',
  'Parents meet the activity test when every adult in the family reports at least 20 usual weekly hours of work.',
  'Provider type and quality tier are the model defaults: a licensed center at the base tier.',
  'The potential annual subsidy is what the model would pay if every eligible child used care at that charge: an upper bound, not spending.',
  'Counts are the children and families the model would pay a positive subsidy, not actual caseloads.',
];

const DEFAULT_MIN_SAMPLE = 30;

/** The dataset field is a local path in the generator; show only the file. */
function datasetName(dataset?: string | null): string {
  if (!dataset) return 'unknown';
  const parts = dataset.split('/');
  return parts[parts.length - 1];
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function NotComputed({ metadata }: { metadata: Metadata | null }) {
  return (
    <section className="results-panel">
      <h2>Population estimates are not computed yet</h2>
      <p>
        This page will show, for each state, how many children and families the model would pay
        a child care subsidy to and the potential subsidy that comes to over a year, from the
        Microcosm microsimulation in <code>scripts/microsim.py</code>. Until that run is
        published to <code>public/data/impact.json</code>, only the calculator and the state
        comparison are available.
      </p>
      <h3>What will appear here</h3>
      <ul>
        <li>
          National totals for eligible children, eligible families and the potential annual
          subsidy.
        </li>
        <li>A map and a ranked bar chart of the eligible share of children under 13 by state.</li>
        <li>A sortable table of every state&rsquo;s eligible population.</li>
        <li>
          A secondary view of the families that already report paying for child care in the CPS.
        </li>
      </ul>
      <h3>Assumptions the estimates will carry</h3>
      <ul>
        {PLANNED_ASSUMPTIONS.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>
      <p>
        States run waiting lists and fund a limited number of children, so these counts describe
        an eligible population rather than a caseload.
        {metadata
          ? ` The rules behind them are policyengine-us ${metadata.policyengine_us_version} for ${metadata.year}.`
          : ''}
      </p>
    </section>
  );
}

export default function Impact() {
  const router = useRouter();
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [impact, setImpact] = useState<ImpactFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricId, setMetricId] = useState<HeadlineMetricId>('eligible_share');
  const [sortColumn, setSortColumn] = useState<HeadlineMetricId>('eligible_share');
  const [descending, setDescending] = useState(true);
  const [paidSortColumn, setPaidSortColumn] = useState<PaidCareMetricId>('eligible_children');
  const [paidDescending, setPaidDescending] = useState(true);

  useEffect(() => {
    Promise.all([loadMetadata().catch(() => null), loadImpact()])
      .then(([meta, file]) => {
        setMetadata(meta);
        setImpact(file);
      })
      .finally(() => setLoading(false));
  }, []);

  const states = useMemo<[string, ImpactStateRow][]>(
    () => Object.entries(impact?.states ?? {}),
    [impact],
  );
  const hasData = states.length > 0;
  const metric = HEADLINE_COLUMNS.find((item) => item.id === metricId) ?? HEADLINE_COLUMNS[0];
  const minSample = impact?.min_sample_units ?? DEFAULT_MIN_SAMPLE;
  const smallSampleNote = `fewer than ${minSample} sampled families; unreliable`;

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    (metadata?.states ?? []).forEach((state) => {
      map[state.code] = state.name;
    });
    return map;
  }, [metadata]);

  const programs = useMemo(() => {
    const map: Record<string, string> = {};
    (metadata?.states ?? []).forEach((state) => {
      map[state.code] = state.program;
    });
    return map;
  }, [metadata]);

  const values = useMemo(() => {
    const map: Record<string, number | null> = {};
    states.forEach(([code, row]) => {
      map[code] = readNumber(row[metricId]);
    });
    return map;
  }, [states, metricId]);

  const rankingRows: RankingRow[] = useMemo(
    () =>
      states
        .map(([code, row]) => {
          const value = readNumber(row[metricId]);
          return value === null
            ? null
            : { code, name: names[code] ?? code, program: programs[code] ?? '', value };
        })
        .filter((row): row is RankingRow => row !== null)
        .sort((a, b) => b.value - a.value),
    [states, metricId, names, programs],
  );

  const tableRows = useMemo(() => {
    const rows = states.map(([code, row]) => ({ code, ...row }));
    rows.sort((a, b) => {
      const left = readNumber(a[sortColumn]) ?? -1;
      const right = readNumber(b[sortColumn]) ?? -1;
      return (left - right) * (descending ? -1 : 1);
    });
    return rows;
  }, [states, sortColumn, descending]);

  const paidRows = useMemo(() => {
    const rows = states
      .map(([code, row]) => (row.paid_care ? { code, ...row.paid_care } : null))
      .filter((row): row is ImpactPaidCare & { code: string } => row !== null);
    rows.sort((a, b) => {
      const left = readNumber(a[paidSortColumn]) ?? -1;
      const right = readNumber(b[paidSortColumn]) ?? -1;
      return (left - right) * (paidDescending ? -1 : 1);
    });
    return rows;
  }, [states, paidSortColumn, paidDescending]);

  const smallSampleCount = paidRows.filter((row) => row.small_sample).length;

  const national = impact?.national;
  const nationalShare =
    national && national.children_under_13 > 0
      ? national.eligible_children / national.children_under_13
      : null;
  const nationalPaidCare = national?.paid_care;
  const assumptions = impact?.assumptions ?? [];

  return (
    <div className="app">
      <header className="app-header">
        <h1>Population impact</h1>
        <p>How many children and families each state&rsquo;s program could pay for</p>
      </header>

      <TabNav />

      <main>
        <div className="stack">
          {loading ? <div className="loading">Loading population estimates…</div> : null}

          {!loading && !hasData ? <NotComputed metadata={metadata} /> : null}

          {!loading && hasData && impact ? (
            <>
              <section className="results-panel">
                <h2>The eligible population</h2>
                <p className="chart-subtitle">
                  Children under 13 whose family would receive a positive subsidy if they used
                  full-time care at{' '}
                  {fmtCurrencyCompact(impact.assumed_charge_per_child_month ?? 0)} per child a
                  month. States fund a limited number of children, so this is an eligible
                  population, not a caseload.
                </p>
                <div className="stat-tiles">
                  <div className="stat-tile">
                    <span className="stat-label">Eligible children</span>
                    <span className="stat-tile-value">
                      {fmtCount(national?.eligible_children ?? 0)}
                    </span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-label">Eligible families</span>
                    <span className="stat-tile-value">
                      {fmtCount(national?.eligible_families ?? 0)}
                    </span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-label">Share of children under 13</span>
                    <span className="stat-tile-value">
                      {nationalShare === null ? '—' : fmtPercent(nationalShare, 1)}
                    </span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-label">Potential annual subsidy</span>
                    <span className="stat-tile-value">
                      {fmtCurrencyCompact(national?.potential_annual_subsidy ?? 0)}
                    </span>
                  </div>
                </div>
                {assumptions.length > 0 ? (
                  <ul className="assumption-list">
                    {assumptions.map((assumption) => (
                      <li key={assumption}>{assumption}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="field-note">
                  Dataset {datasetName(impact.dataset)}, policyengine-us{' '}
                  {impact.policyengine_us_version ?? impact.policyengine_version ?? 'unknown'},
                  policy year {impact.year}.
                </p>
              </section>

              <section className="results-panel">
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="impact-metric">Metric</label>
                    <select
                      id="impact-metric"
                      value={metricId}
                      onChange={(event) =>
                        setMetricId(event.target.value as HeadlineMetricId)
                      }
                    >
                      {HEADLINE_COLUMNS.filter((item) => MAP_METRIC_IDS.includes(item.id)).map(
                        (item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>
                <StateMap
                  values={values}
                  names={names}
                  subtitles={programs}
                  selectedState={rankingRows[0]?.code ?? ''}
                  onSelect={(code: string) => router.push(`/?state=${code}`)}
                  formatValue={metric.format}
                  lowLabel="Lower"
                  highLabel="Higher"
                />
              </section>

              <section className="results-panel">
                <h2>Ranked by {metric.label.toLowerCase()}</h2>
                <RankingChart
                  rows={rankingRows}
                  selectedState={rankingRows[0]?.code ?? ''}
                  onSelect={(code) => router.push(`/?state=${code}`)}
                  formatValue={metric.format}
                />
              </section>

              <section className="results-panel">
                <h2>All states</h2>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">State</th>
                        {HEADLINE_COLUMNS.map((item) => (
                          <th key={item.id} scope="col" className="numeric">
                            <button
                              type="button"
                              className={`sort-btn ${sortColumn === item.id ? 'active' : ''}`}
                              onClick={() => {
                                if (sortColumn === item.id) setDescending(!descending);
                                else {
                                  setSortColumn(item.id);
                                  setDescending(true);
                                }
                              }}
                            >
                              {item.label}
                              {sortColumn === item.id ? (
                                <span aria-hidden>{descending ? ' ↓' : ' ↑'}</span>
                              ) : null}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row) => (
                        <tr key={row.code}>
                          <th scope="row">{names[row.code] ?? row.code}</th>
                          {HEADLINE_COLUMNS.map((item) => {
                            const value = readNumber(row[item.id]);
                            return (
                              <td key={item.id} className="numeric">
                                {value === null ? '—' : item.format(value)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="results-panel">
                <h2>Families already paying for care</h2>
                <p className="chart-subtitle">
                  The subset of families that report child care expenses in the CPS. These
                  families skew higher income, and the survey samples few of them in small
                  states, so read the per-state figures as indicative.
                </p>
                {nationalPaidCare ? (
                  <div className="stat-tiles">
                    <div className="stat-tile">
                      <span className="stat-label">Children in paid care</span>
                      <span className="stat-tile-value">
                        {fmtCount(nationalPaidCare.children_in_paid_care)}
                      </span>
                    </div>
                    <div className="stat-tile">
                      <span className="stat-label">Eligible children</span>
                      <span className="stat-tile-value">
                        {fmtCount(nationalPaidCare.eligible_children)}
                      </span>
                    </div>
                    <div className="stat-tile">
                      <span className="stat-label">Eligible families</span>
                      <span className="stat-tile-value">
                        {fmtCount(nationalPaidCare.eligible_families)}
                      </span>
                    </div>
                    <div className="stat-tile">
                      <span className="stat-label">Potential annual subsidy</span>
                      <span className="stat-tile-value">
                        {fmtCurrencyCompact(nationalPaidCare.annual_subsidy)}
                      </span>
                    </div>
                  </div>
                ) : null}
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">State</th>
                        {PAID_CARE_COLUMNS.map((item) => (
                          <th key={item.id} scope="col" className="numeric">
                            <button
                              type="button"
                              className={`sort-btn ${paidSortColumn === item.id ? 'active' : ''}`}
                              onClick={() => {
                                if (paidSortColumn === item.id) setPaidDescending(!paidDescending);
                                else {
                                  setPaidSortColumn(item.id);
                                  setPaidDescending(true);
                                }
                              }}
                            >
                              {item.label}
                              {paidSortColumn === item.id ? (
                                <span aria-hidden>{paidDescending ? ' ↓' : ' ↑'}</span>
                              ) : null}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paidRows.map((row) => (
                        <tr
                          key={row.code}
                          className={row.small_sample ? 'small-sample' : ''}
                          title={row.small_sample ? smallSampleNote : undefined}
                        >
                          <th scope="row">
                            {names[row.code] ?? row.code}
                            {row.small_sample ? (
                              <span aria-hidden> †</span>
                            ) : null}
                            {row.small_sample ? (
                              <span className="visually-hidden"> ({smallSampleNote})</span>
                            ) : null}
                          </th>
                          {PAID_CARE_COLUMNS.map((item) => {
                            const value = readNumber(row[item.id]);
                            return (
                              <td key={item.id} className="numeric">
                                {value === null ? '—' : item.format(value)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="field-note">
                  † Greyed states have {smallSampleNote}.
                  {smallSampleCount > 0
                    ? ` ${smallSampleCount} of ${paidRows.length} states in this run.`
                    : ' No state is flagged in this run.'}
                </p>
              </section>
            </>
          ) : null}
        </div>
      </main>

      <AppFooter metadata={metadata} />
    </div>
  );
}
