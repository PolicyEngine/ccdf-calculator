'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppFooter from './AppFooter';
import RankingChart, { type RankingRow } from './RankingChart';
import StateMap from './StateMap';
import TabNav from './TabNav';
import { loadAcfServed, loadImpact, loadMetadata } from '@/lib/dataLookup';
import { fmtCount, fmtCurrencyCompact, fmtPercent } from '@/lib/format';
import type {
  AcfServedFile,
  ImpactFile,
  ImpactPaidCare,
  ImpactStateRow,
  Metadata,
} from '@/lib/types';

/** Columns of the headline table: the model's eligible population and ACF's caseload. */
type HeadlineMetricId =
  | 'eligible_share'
  | 'eligible_children'
  | 'served_children'
  | 'served_per_100'
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

/** One state's row once the ACF caseload is joined onto the model output. */
type HeadlineRow = ImpactStateRow & {
  code: string;
  served_children: number | null;
  served_per_100: number | null;
};

const HEADLINE_COLUMNS: Column<HeadlineMetricId>[] = [
  { id: 'eligible_share', label: 'Share of children under 13 who would qualify', format: (v) => fmtPercent(v, 1) },
  { id: 'eligible_children', label: 'Children who would qualify', format: fmtCount },
  { id: 'served_children', label: 'Children served (ACF)', format: fmtCount },
  { id: 'served_per_100', label: 'Served per 100 who would qualify', format: (v) => v.toFixed(1) },
  { id: 'eligible_families', label: 'Families who would qualify', format: fmtCount },
  { id: 'children_under_13', label: 'Children under 13', format: fmtCount },
  { id: 'potential_annual_subsidy', label: 'Potential subsidy, upper bound', format: fmtCurrencyCompact },
];

/** Metrics offered as the map and ranking colour, in that order. */
const MAP_METRIC_IDS: HeadlineMetricId[] = [
  'eligible_share',
  'eligible_children',
  'served_per_100',
  'served_children',
  'potential_annual_subsidy',
];

const PAID_CARE_COLUMNS: Column<PaidCareMetricId>[] = [
  { id: 'children_in_paid_care', label: 'Children in paid care', format: fmtCount },
  { id: 'eligible_children', label: 'Children who would qualify', format: fmtCount },
  { id: 'eligible_families', label: 'Families who would qualify', format: fmtCount },
  { id: 'annual_subsidy', label: 'Potential subsidy, upper bound', format: fmtCurrencyCompact },
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

function per100(served: number | null, eligible: number): number | null {
  if (served === null || eligible <= 0) return null;
  return (served / eligible) * 100;
}

function longDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
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
          National totals for children and families who would qualify and the potential annual
          subsidy, alongside the children each state actually served.
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
  const [served, setServed] = useState<AcfServedFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricId, setMetricId] = useState<HeadlineMetricId>('eligible_share');
  const [sortColumn, setSortColumn] = useState<HeadlineMetricId>('eligible_share');
  const [descending, setDescending] = useState(true);
  const [paidSortColumn, setPaidSortColumn] = useState<PaidCareMetricId>('eligible_children');
  const [paidDescending, setPaidDescending] = useState(true);

  useEffect(() => {
    Promise.all([loadMetadata().catch(() => null), loadImpact(), loadAcfServed()])
      .then(([meta, file, acf]) => {
        setMetadata(meta);
        setImpact(file);
        setServed(acf);
      })
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo<HeadlineRow[]>(
    () =>
      Object.entries(impact?.states ?? {}).map(([code, row]) => {
        const servedChildren = readNumber(served?.states[code]?.children);
        return {
          code,
          ...row,
          served_children: servedChildren,
          served_per_100: per100(servedChildren, row.eligible_children),
        };
      }),
    [impact, served],
  );
  const hasData = rows.length > 0;
  const hasServed = served !== null;
  // The served columns exist only when the ACF file loaded.
  const { columns, mapMetricIds, metric } = useMemo(() => {
    const shown = hasServed
      ? HEADLINE_COLUMNS
      : HEADLINE_COLUMNS.filter((item) => !item.id.startsWith('served'));
    const ids = hasServed
      ? MAP_METRIC_IDS
      : MAP_METRIC_IDS.filter((id) => !id.startsWith('served'));
    return {
      columns: shown,
      mapMetricIds: ids,
      metric: shown.find((item) => item.id === metricId) ?? shown[0],
    };
  }, [hasServed, metricId]);
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
    rows.forEach((row) => {
      map[row.code] = readNumber(row[metric.id]);
    });
    return map;
  }, [rows, metric]);

  const rankingRows: RankingRow[] = useMemo(
    () =>
      rows
        .map((row) => {
          const value = readNumber(row[metric.id]);
          return value === null
            ? null
            : { code: row.code, name: names[row.code] ?? row.code, program: programs[row.code] ?? '', value };
        })
        .filter((row): row is RankingRow => row !== null)
        .sort((a, b) => b.value - a.value),
    [rows, metric, names, programs],
  );

  const tableRows = useMemo(() => {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const left = readNumber(a[sortColumn]) ?? -1;
      const right = readNumber(b[sortColumn]) ?? -1;
      return (left - right) * (descending ? -1 : 1);
    });
    return sorted;
  }, [rows, sortColumn, descending]);

  const paidRows = useMemo(() => {
    const collected = rows
      .map((row) => (row.paid_care ? { code: row.code, ...row.paid_care } : null))
      .filter((row): row is ImpactPaidCare & { code: string } => row !== null);
    collected.sort((a, b) => {
      const left = readNumber(a[paidSortColumn]) ?? -1;
      const right = readNumber(b[paidSortColumn]) ?? -1;
      return (left - right) * (paidDescending ? -1 : 1);
    });
    return collected;
  }, [rows, paidSortColumn, paidDescending]);

  const smallSampleCount = paidRows.filter((row) => row.small_sample).length;

  const national = impact?.national;
  const nationalShare =
    national && national.children_under_13 > 0
      ? national.eligible_children / national.children_under_13
      : null;
  // 50 states + DC, to match the model's coverage; ACF's own national total
  // also counts the territories.
  const nationalServed = served ? served.states_total.children : null;
  const nationalPer100 =
    national && nationalServed !== null ? per100(nationalServed, national.eligible_children) : null;
  const nationalPaidCare = national?.paid_care;
  const assumptions = impact?.assumptions ?? [];
  const source = served?.source ?? null;
  const chargeLabel = fmtCurrencyCompact(impact?.assumed_charge_per_child_month ?? 0);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Population impact</h1>
        <p>How many children would qualify in each state, and how many are served</p>
      </header>

      <TabNav />

      <main>
        <div className="stack">
          {loading ? <div className="loading">Loading population estimates…</div> : null}

          {!loading && !hasData ? <NotComputed metadata={metadata} /> : null}

          {!loading && hasData && impact ? (
            <>
              <section className="results-panel">
                <h2>Who would qualify, and who is served</h2>
                <p className="chart-subtitle">
                  The model counts children under 13 whose family would receive a subsidy if
                  they used full-time care at {chargeLabel} per child a month.
                  {hasServed && source
                    ? ` The Administration for Children and Families counts the children states actually funded in an average month of fiscal year ${source.fiscal_year}.`
                    : ''}{' '}
                  The gap between the two reflects limited funding and waiting lists, take-up,
                  whether families use paid care at all, and the assumptions listed below.
                </p>
                <div className="stat-tiles">
                  <div className="stat-tile">
                    <span className="stat-label">Children who would qualify</span>
                    <span className="stat-tile-value">
                      {fmtCount(national?.eligible_children ?? 0)}
                    </span>
                    <span className="stat-tile-note">
                      Model, {impact.year}; {nationalShare === null ? '' : `${fmtPercent(nationalShare, 1)} of `}
                      children under 13
                    </span>
                  </div>
                  {hasServed && source ? (
                    <div className="stat-tile">
                      <span className="stat-label">Children served</span>
                      <span className="stat-tile-value">{fmtCount(nationalServed ?? 0)}</span>
                      <span className="stat-tile-note">
                        ACF, average month of FY {source.fiscal_year}, 50 states and DC
                      </span>
                    </div>
                  ) : (
                    <div className="stat-tile">
                      <span className="stat-label">Families who would qualify</span>
                      <span className="stat-tile-value">
                        {fmtCount(national?.eligible_families ?? 0)}
                      </span>
                    </div>
                  )}
                  {hasServed ? (
                    <div className="stat-tile">
                      <span className="stat-label">Served per 100 who would qualify</span>
                      <span className="stat-tile-value">
                        {nationalPer100 === null ? '—' : nationalPer100.toFixed(1)}
                      </span>
                      <span className="stat-tile-note">
                        {fmtCount(national?.eligible_families ?? 0)} families would qualify
                      </span>
                    </div>
                  ) : (
                    <div className="stat-tile">
                      <span className="stat-label">Share of children under 13</span>
                      <span className="stat-tile-value">
                        {nationalShare === null ? '—' : fmtPercent(nationalShare, 1)}
                      </span>
                    </div>
                  )}
                  <div className="stat-tile">
                    <span className="stat-label">Potential annual subsidy</span>
                    <span className="stat-tile-value">
                      {fmtCurrencyCompact(national?.potential_annual_subsidy ?? 0)}
                    </span>
                    <span className="stat-tile-note">
                      Upper bound if every qualifying child used care; not spending
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
                  Model: dataset {datasetName(impact.dataset)}, policyengine-us{' '}
                  {impact.policyengine_us_version ?? impact.policyengine_version ?? 'unknown'},
                  policy year {impact.year}.
                  {source ? (
                    <>
                      {' '}
                      Children served: <a href={source.href}>{source.title}</a>, {source.publisher}
                      , published {longDate(source.publication_date)}. Average monthly adjusted
                      count of children funded through CCDF, rounded to the nearest 100; the
                      latest fiscal year published.
                    </>
                  ) : null}
                </p>
              </section>

              <section className="results-panel">
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="impact-metric">Metric</label>
                    <select
                      id="impact-metric"
                      value={metric.id}
                      onChange={(event) =>
                        setMetricId(event.target.value as HeadlineMetricId)
                      }
                    >
                      {columns
                        .filter((item) => mapMetricIds.includes(item.id))
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
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
                        {columns.map((item) => (
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
                          {columns.map((item) => {
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
                      <span className="stat-label">Children who would qualify</span>
                      <span className="stat-tile-value">
                        {fmtCount(nationalPaidCare.eligible_children)}
                      </span>
                    </div>
                    <div className="stat-tile">
                      <span className="stat-label">Families who would qualify</span>
                      <span className="stat-tile-value">
                        {fmtCount(nationalPaidCare.eligible_families)}
                      </span>
                    </div>
                    <div className="stat-tile">
                      <span className="stat-label">Potential annual subsidy</span>
                      <span className="stat-tile-value">
                        {fmtCurrencyCompact(nationalPaidCare.annual_subsidy)}
                      </span>
                      <span className="stat-tile-note">Upper bound; not spending</span>
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
                            {row.small_sample ? <span aria-hidden> †</span> : null}
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
