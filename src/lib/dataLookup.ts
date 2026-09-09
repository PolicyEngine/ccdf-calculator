/**
 * Client-side data layer over the precomputed files in `public/data/`.
 * Loads and caches them, matches a user household onto the reference grid,
 * and interpolates on the income axis.
 */

import type {
  ImpactFile,
  Metadata,
  PolicyIndex,
  StateData,
  StateInputConfig,
  StateInputsFile,
  StructureGrid,
} from './types';

const DATA_BASE = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/data`;

const cache = new Map<string, Promise<unknown>>();

function loadJson<T>(name: string): Promise<T> {
  const existing = cache.get(name);
  if (existing) return existing as Promise<T>;
  const promise = fetch(`${DATA_BASE}/${name}.json`).then(async (res) => {
    if (!res.ok) throw new Error(`Could not load ${name}.json (${res.status})`);
    return (await res.json()) as T;
  });
  cache.set(name, promise);
  return promise as Promise<T>;
}

export function loadMetadata(): Promise<Metadata> {
  return loadJson<Metadata>('metadata');
}

export function loadStateData(code: string): Promise<StateData> {
  return loadJson<StateData>(code);
}

export function loadStateInputs(): Promise<StateInputsFile> {
  return loadJson<StateInputsFile>('state_inputs');
}

/**
 * `policy_index.json` is written by Python's `json.dump`, which emits bare
 * `Infinity` for unbounded bracket thresholds. That is valid to Python and
 * invalid to `JSON.parse`, so rewrite those tokens to `1e999`, which parses
 * back to `Infinity` with the same meaning.
 */
function reviveInfinities(text: string): string {
  return text.replace(/(:\s*)(-?)Infinity\b/g, '$1$21e999');
}

export function loadPolicyIndex(): Promise<PolicyIndex> {
  const existing = cache.get('policy_index');
  if (existing) return existing as Promise<PolicyIndex>;
  const promise = fetch(`${DATA_BASE}/policy_index.json`).then(async (res) => {
    if (!res.ok) throw new Error(`Could not load policy_index.json (${res.status})`);
    return JSON.parse(reviveInfinities(await res.text())) as PolicyIndex;
  });
  cache.set('policy_index', promise);
  return promise;
}

/** `impact.json` is optional; a missing or malformed file resolves to null. */
export async function loadImpact(): Promise<ImpactFile | null> {
  try {
    const res = await fetch(`${DATA_BASE}/impact.json`);
    if (!res.ok) return null;
    const text = await res.text();
    const parsed = JSON.parse(text) as ImpactFile;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Reference-structure matching
 * ------------------------------------------------------------------ */

export const CHILD_STRUCTURE_LABELS: Record<string, string> = {
  infant: 'One infant (age 1)',
  preschool: 'One preschooler (age 3)',
  school: 'One school-age child (age 7)',
  two: 'Two children (ages 3 and 7)',
  three: 'Three children (ages 1, 3 and 7)',
};

export const SCHOOL_AGE_CUTOFF = 5;
export const FULL_TIME_HOURS_PER_DAY = 8;
export const SCHOOL_AGE_HOURS_PER_DAY = 3;

export function defaultHoursPerDay(age: number): number {
  return age < SCHOOL_AGE_CUTOFF ? FULL_TIME_HOURS_PER_DAY : SCHOOL_AGE_HOURS_PER_DAY;
}

/** Map a set of child ages onto the closest reference child structure. */
export function childStructureKey(ages: number[]): string {
  if (ages.length >= 3) return 'three';
  if (ages.length === 2) return 'two';
  const age = ages.length === 1 ? ages[0] : 3;
  if (age < 2) return 'infant';
  if (age < SCHOOL_AGE_CUTOFF) return 'preschool';
  return 'school';
}

export function structureKey(adults: number, childKey: string): string {
  return `${Math.min(Math.max(adults, 1), 2)}_${childKey}`;
}

export function nearestChargeIndex(meta: Metadata, charge: number): number {
  let best = 0;
  let bestDistance = Infinity;
  meta.charge_levels.forEach((level, index) => {
    const distance = Math.abs(level - charge);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/* ------------------------------------------------------------------ *
 * Interpolation
 * ------------------------------------------------------------------ */

/** Linear interpolation of a series defined on an evenly spaced income axis. */
export function interpolate(series: number[], steps: number[], income: number): number {
  if (!series || series.length === 0) return 0;
  const first = steps[0];
  const last = steps[steps.length - 1];
  const clamped = Math.min(Math.max(income, first), last);
  const step = steps.length > 1 ? steps[1] - steps[0] : 1;
  const position = (clamped - first) / step;
  const lower = Math.min(Math.floor(position), series.length - 1);
  const upper = Math.min(lower + 1, series.length - 1);
  const fraction = position - lower;
  const value = series[lower] + (series[upper] - series[lower]) * fraction;
  return Math.max(0, value);
}

function nearestIndex(steps: number[], income: number): number {
  const step = steps.length > 1 ? steps[1] - steps[0] : 1;
  const clamped = Math.min(Math.max(income, steps[0]), steps[steps.length - 1]);
  return Math.min(Math.round((clamped - steps[0]) / step), steps.length - 1);
}

/* ------------------------------------------------------------------ *
 * Estimates from the grid
 * ------------------------------------------------------------------ */

export interface EstimateHousehold {
  adults: number;
  childAges: number[];
  income: number;
  monthlyChargePerChild: number;
}

export interface Estimate {
  key: string;
  childKey: string;
  adults: number;
  chargeIndex: number;
  chargeLevel: number;
  subsidy: number;
  copay: number;
  outOfPocket: number;
  eligible: boolean;
  fpg: number;
  smi: number;
  incomeShareOfFpg: number;
  incomeShareOfSmi: number;
}

export function gridFor(state: StateData, key: string): StructureGrid | null {
  return state.structures[key] ?? null;
}

export function estimate(
  meta: Metadata,
  state: StateData,
  household: EstimateHousehold,
): Estimate | null {
  const childKey = childStructureKey(household.childAges);
  const key = structureKey(household.adults, childKey);
  const grid = gridFor(state, key);
  if (!grid) return null;

  const chargeIndex = nearestChargeIndex(meta, household.monthlyChargePerChild);
  const steps = meta.income_steps;
  const subsidy = interpolate(grid.subsidy[chargeIndex], steps, household.income);
  const copay = interpolate(grid.copay[chargeIndex], steps, household.income);
  const eligible = Boolean(grid.eligible[chargeIndex][nearestIndex(steps, household.income)]);
  const childCount = Math.max(household.childAges.length, 1);
  const outOfPocket = Math.max(0, household.monthlyChargePerChild * childCount - subsidy);

  return {
    key,
    childKey,
    adults: Math.min(Math.max(household.adults, 1), 2),
    chargeIndex,
    chargeLevel: meta.charge_levels[chargeIndex],
    subsidy,
    copay,
    outOfPocket,
    eligible,
    fpg: grid.fpg,
    smi: grid.smi,
    incomeShareOfFpg: grid.fpg > 0 ? household.income / grid.fpg : 0,
    incomeShareOfSmi: grid.smi > 0 ? household.income / grid.smi : 0,
  };
}

/** Value of one metric for one state at one point on the grid. */
export function valueAt(
  meta: Metadata,
  state: StateData,
  key: string,
  chargeIndex: number,
  income: number,
  field: 'subsidy' | 'copay',
): number | null {
  const grid = gridFor(state, key);
  if (!grid) return null;
  return interpolate(grid[field][chargeIndex], meta.income_steps, income);
}

export interface ChartPoint {
  income: number;
  subsidy: number;
  copay: number;
}

/** Subsidy and copay across the whole income axis for one reference cell. */
export function incomeSeries(
  meta: Metadata,
  state: StateData,
  key: string,
  chargeIndex: number,
): ChartPoint[] {
  const grid = gridFor(state, key);
  if (!grid) return [];
  return meta.income_steps.map((income, index) => ({
    income,
    subsidy: grid.subsidy[chargeIndex][index],
    copay: grid.copay[chargeIndex][index],
  }));
}

/** Subsidy for every child structure at one income, for the given adults. */
export function structureComparison(
  meta: Metadata,
  state: StateData,
  adults: number,
  chargeIndex: number,
  income: number,
): { childKey: string; label: string; subsidy: number }[] {
  return Object.keys(meta.child_structures).map((childKey) => {
    const grid = gridFor(state, structureKey(adults, childKey));
    return {
      childKey,
      label: CHILD_STRUCTURE_LABELS[childKey] ?? childKey,
      subsidy: grid ? interpolate(grid.subsidy[chargeIndex], meta.income_steps, income) : 0,
    };
  });
}

export interface StateComparisonRow {
  code: string;
  name: string;
  program: string;
  subsidy: number | null;
  copay: number | null;
  eligible: boolean;
  cutoffIncome: number | null;
  cutoffShareOfFpg: number | null;
  cutoffShareOfSmi: number | null;
  /** True when the model still pays a subsidy at the top of the income axis. */
  cutoffBeyondAxis: boolean;
}

/** Load every state file and evaluate one reference cell across all 51. */
export async function compareStates(
  meta: Metadata,
  policy: PolicyIndex,
  key: string,
  chargeIndex: number,
  income: number,
): Promise<StateComparisonRow[]> {
  const maxIncome = meta.income_steps[meta.income_steps.length - 1];
  const rows = await Promise.all(
    meta.states.map(async (summary): Promise<StateComparisonRow> => {
      const threshold = policy.states[summary.code]?.thresholds?.[key] ?? null;
      const base = {
        code: summary.code,
        name: summary.name,
        program: summary.program,
        cutoffIncome: threshold ? threshold.income : null,
        cutoffShareOfFpg: threshold ? threshold.fpg_ratio : null,
        cutoffShareOfSmi: threshold ? threshold.smi_ratio : null,
        cutoffBeyondAxis: Boolean(threshold && threshold.income >= maxIncome),
      };
      try {
        const state = await loadStateData(summary.code);
        const grid = gridFor(state, key);
        if (!grid) return { ...base, subsidy: null, copay: null, eligible: false };
        return {
          ...base,
          subsidy: interpolate(grid.subsidy[chargeIndex], meta.income_steps, income),
          copay: interpolate(grid.copay[chargeIndex], meta.income_steps, income),
          eligible: Boolean(grid.eligible[chargeIndex][nearestIndex(meta.income_steps, income)]),
        };
      } catch {
        return { ...base, subsidy: null, copay: null, eligible: false };
      }
    }),
  );
  return rows;
}

/* ------------------------------------------------------------------ *
 * Reference-household assumptions
 * ------------------------------------------------------------------ */

export interface HouseholdShape {
  adults: number;
  childAges: number[];
  hoursPerDay: number[];
  daysPerWeek: number;
  attendingDaysPerMonth: number;
  monthlyChargePerChild: number;
  inActivity: boolean;
}

/**
 * Ways the user's household differs from the reference household behind the
 * estimate. Empty when the estimate applies exactly.
 */
export function referenceGaps(
  meta: Metadata,
  household: HouseholdShape,
  chargeIndex: number,
): string[] {
  const gaps: string[] = [];
  const reference = meta.child_structures[childStructureKey(household.childAges)];
  if (!reference) return gaps;

  const ages = household.childAges;
  if (ages.length !== reference.ages.length) {
    gaps.push(
      `The grid covers ${reference.ages.length} ${reference.ages.length === 1 ? 'child' : 'children'}, not ${ages.length}.`,
    );
  } else if (ages.some((age, i) => age !== reference.ages[i])) {
    gaps.push(
      `Ages are read as ${reference.ages.join(' and ')}, not ${ages.join(' and ')}.`,
    );
  }
  const referenceHours = reference.hours_per_day;
  if (
    household.hoursPerDay.length !== referenceHours.length ||
    household.hoursPerDay.some((hours, i) => hours !== referenceHours[i])
  ) {
    gaps.push(`Care hours are read as ${referenceHours.join(' and ')} per day.`);
  }
  if (household.daysPerWeek !== meta.assumptions.days_per_week) {
    gaps.push(`Care is read as ${meta.assumptions.days_per_week} days per week.`);
  }
  if (household.attendingDaysPerMonth !== meta.assumptions.attending_days_per_month) {
    gaps.push(
      `Attendance is read as ${meta.assumptions.attending_days_per_month} days per month.`,
    );
  }
  const chargeLevel = meta.charge_levels[chargeIndex];
  if (household.monthlyChargePerChild !== chargeLevel) {
    gaps.push(
      `The provider charge is rounded to the nearest grid level, $${chargeLevel.toLocaleString('en-US')} per child per month.`,
    );
  }
  if (!household.inActivity) {
    gaps.push('The grid assumes the parents meet the work or activity test.');
  }
  return gaps;
}
