/**
 * Shapes of the generated files in `public/data/`, per docs/DATA_CONTRACT.md.
 * These mirror the writers in `scripts/`; keep them in sync with that contract.
 */

export interface StateSummary {
  code: string;
  name: string;
  program: string;
  county: string | null;
}

export interface ChildStructure {
  ages: number[];
  hours_per_day: number[];
}

export interface Metadata {
  policyengine_us_version: string;
  year: number;
  income_steps: number[];
  charge_levels: number[];
  default_charge_index: number;
  adults_range: number[];
  child_structures: Record<string, ChildStructure>;
  assumptions: {
    monthly_charge_per_child: number;
    days_per_week: number;
    attending_days_per_month: number;
    weekly_hours_worked: number;
    provider: string;
  };
  states: StateSummary[];
}

export interface StructureGrid {
  /** [chargeIndex][incomeIndex], dollars per month. */
  subsidy: number[][];
  copay: number[][];
  eligible: boolean[][];
  /** Annual federal poverty guideline for this reference unit. */
  fpg: number;
  /** Annual state median income for this unit size. */
  smi: number;
}

export interface StateData {
  state: string;
  year: number;
  structures: Record<string, StructureGrid>;
}

export interface StateInputOption {
  value: string;
  label: string;
}

export interface StateInput {
  name: string;
  label: string;
  entity: 'person' | 'spm_unit';
  type: 'enum' | 'bool' | 'number';
  default: string | boolean | number;
  options?: StateInputOption[];
}

export interface StateInputConfig {
  code: string;
  name: string;
  program: string;
  /** Monthly subsidy variable (annual sum over the year in the API result). */
  main: string;
  copay: string;
  copay_entity: 'spm_unit' | 'person';
  copay_factor: number | 'days';
  eligible: string | null;
  county: string | null;
  copay_label: string;
  main_label: string;
  outputs: string[];
  inputs: StateInput[];
}

export interface StateInputsFile {
  year: number;
  states: Record<string, StateInputConfig>;
}

/** One state's income series for one (structure, charge) cell of the grid. */
export interface CompareSeries {
  subsidy: number[];
  copay: number[];
  eligible: boolean[];
}

/** `compare/{structure}_{chargeIndex}.json` from `scripts/build_compare.py`. */
export interface CompareCellFile {
  structure: string;
  charge_index: number;
  charge_level: number;
  policyengine_us_version: string;
  income_steps: number[];
  states: Record<string, CompareSeries>;
}

export interface AcfServedSource {
  title: string;
  href: string;
  publisher: string;
  fiscal_year: number;
  publication_date: string;
  data_as_of: string;
  notes: string[];
}

export interface AcfServedCount {
  families: number;
  children: number;
}

/** `acf_served.json` from `scripts/acf_served.py`: children actually funded. */
export interface AcfServedFile {
  source: AcfServedSource;
  states: Record<string, AcfServedCount>;
  states_total: AcfServedCount;
  published_national_total: AcfServedCount;
}

export interface PolicyReference {
  title: string;
  href: string;
}

export interface PolicyScaleBracket {
  /** `null` for an open-ended bracket edge; see PolicyRules for rendering. */
  threshold: number | null;
  amount?: number;
  /** A few scales carry a rate rather than an amount. */
  rate?: number;
}

export type PolicyValue = number | boolean | string | Array<string | number>;

export interface PolicyParameter {
  path: string;
  label: string;
  description?: string | null;
  unit?: string | null;
  period?: string | null;
  values?: Record<string, PolicyValue>;
  scale?: PolicyScaleBracket[];
  references?: PolicyReference[];
}

export interface PolicyThreshold {
  /** Highest annual earned income at which the model still pays a subsidy. */
  income: number;
  fpg_ratio: number;
  smi_ratio: number;
  max_subsidy: number;
  subsidy_at_zero_income: number;
}

export interface StatePolicy {
  code: string;
  name: string;
  program: string;
  parameter_root: string;
  parameters_used: string[];
  parameters: PolicyParameter[];
  thresholds: Record<string, PolicyThreshold | null>;
}

export interface PolicyIndex {
  year: number;
  states: Record<string, StatePolicy>;
}

/** Families reporting child care expenses in the CPS: a subset of the eligible. */
export interface ImpactPaidCare {
  eligible_children: number;
  eligible_families: number;
  /** Annual subsidy for this subset only; still potential, not spending. */
  annual_subsidy: number;
  children_in_paid_care: number;
  /** Unweighted sampled units with paid care in the state. */
  sample_units?: number;
  /** `sample_units` below `min_sample_units`: too few to be reliable. */
  small_sample?: boolean;
}

export interface ImpactStateRow {
  eligible_children: number;
  eligible_families: number;
  /** Upper bound if every eligible child used care at the assumed charge. */
  potential_annual_subsidy: number;
  children_under_13: number;
  /** `eligible_children / children_under_13`. */
  eligible_share: number;
  paid_care?: ImpactPaidCare;
}

export interface ImpactNational {
  eligible_children: number;
  eligible_families: number;
  potential_annual_subsidy: number;
  children_under_13: number;
  paid_care?: ImpactPaidCare;
}

export interface ImpactFile {
  year: number;
  dataset?: string | null;
  policyengine_version?: string | null;
  policyengine_us_version?: string | null;
  bundle?: string | null;
  assumed_charge_per_child_month?: number;
  /** Sampled units below which a paid-care row is flagged unreliable. */
  min_sample_units?: number;
  assumptions?: string[];
  national?: ImpactNational;
  states?: Record<string, ImpactStateRow>;
}
