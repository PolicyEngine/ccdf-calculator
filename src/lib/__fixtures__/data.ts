/**
 * Small, hand-checkable stand-ins for the generated data files. The grid is
 * defined by formulas so every expected value in a test can be derived by
 * hand: subsidy[ci][i] = adults * (ci + 1) * 100 * max(0, 10 - i) and
 * copay[ci][i] = 10 * i, on an income axis of $0 to $10,000 in $1,000 steps.
 */

import type { Metadata, StateData, StateInputConfig, StructureGrid } from '../types';

export const INCOME_STEPS = Array.from({ length: 11 }, (_, i) => i * 1000);
export const CHARGE_LEVELS = [1000, 1500, 2000];

export const CHILD_STRUCTURES: Metadata['child_structures'] = {
  infant: { ages: [1], hours_per_day: [8] },
  preschool: { ages: [3], hours_per_day: [8] },
  school: { ages: [7], hours_per_day: [3] },
  two: { ages: [3, 7], hours_per_day: [8, 3] },
  three: { ages: [1, 3, 7], hours_per_day: [8, 8, 3] },
};

export function makeMetadata(): Metadata {
  return {
    policyengine_us_version: '1.824.7',
    year: 2026,
    income_steps: [...INCOME_STEPS],
    charge_levels: [...CHARGE_LEVELS],
    default_charge_index: 1,
    adults_range: [1, 2],
    child_structures: CHILD_STRUCTURES,
    assumptions: {
      monthly_charge_per_child: 1500,
      days_per_week: 5,
      attending_days_per_month: 22,
      weekly_hours_worked: 40,
      provider: 'a licensed center',
    },
    states: [
      { code: 'AA', name: 'Alpha', program: 'Alpha Child Care', county: 'ALPHA_COUNTY_AA' },
      { code: 'BB', name: 'Beta', program: 'Beta Child Care', county: null },
    ],
  };
}

export function makeGrid(scale = 1): StructureGrid {
  const subsidy = CHARGE_LEVELS.map((_, ci) =>
    INCOME_STEPS.map((_, i) => scale * (ci + 1) * 100 * Math.max(0, 10 - i)),
  );
  const copay = CHARGE_LEVELS.map(() => INCOME_STEPS.map((_, i) => 10 * i));
  const eligible = subsidy.map((row) => row.map((value) => value > 0));
  return { subsidy, copay, eligible, fpg: 27000, smi: 100000 };
}

/** Ten structures; the two-adult grids pay double the one-adult grids. */
export function makeStateData(code = 'AA'): StateData {
  const structures: Record<string, StructureGrid> = {};
  [1, 2].forEach((adults) => {
    Object.keys(CHILD_STRUCTURES).forEach((childKey) => {
      structures[`${adults}_${childKey}`] = makeGrid(adults);
    });
  });
  return { state: code, year: 2026, structures };
}

const OUTPUT_COMMON = ['child_care_subsidies', 'spm_unit_fpg', 'hhs_smi'];

/** Weekly copay on the SPM unit, an enrollment flag and a provider enum. */
export const MD_CONFIG: StateInputConfig = {
  code: 'MD',
  name: 'Maryland',
  program: 'Child Care Scholarship',
  main: 'md_ccs',
  copay: 'md_ccs_weekly_copay',
  copay_entity: 'spm_unit',
  copay_factor: 52 / 12,
  eligible: 'md_ccs_eligible',
  county: 'MONTGOMERY_COUNTY_MD',
  copay_label: 'Maryland CCS weekly copayment',
  main_label: 'Maryland CCS benefit amount',
  outputs: [...OUTPUT_COMMON, 'md_ccs', 'md_ccs_weekly_copay', 'md_ccs_eligible'],
  inputs: [
    {
      name: 'md_ccs_enrolled',
      label: 'Currently enrolled',
      entity: 'spm_unit',
      type: 'bool',
      default: false,
    },
    {
      name: 'md_ccs_provider_type',
      label: 'Provider type',
      entity: 'person',
      type: 'enum',
      default: 'NONE',
      options: [
        { value: 'LICENSED_CENTER', label: 'Licensed center' },
        { value: 'INFORMAL', label: 'Informal' },
        { value: 'NONE', label: 'None' },
      ],
    },
  ],
};

/** Daily copay defined on each child. */
export const AR_CONFIG: StateInputConfig = {
  code: 'AR',
  name: 'Arkansas',
  program: 'School Readiness Assistance',
  main: 'ar_sra',
  copay: 'ar_sra_daily_copay',
  copay_entity: 'person',
  copay_factor: 'days',
  eligible: 'is_ar_sra_eligible',
  county: 'PULASKI_COUNTY_AR',
  copay_label: 'Arkansas SRA daily family copay',
  main_label: 'Arkansas SRA benefit amount',
  outputs: [...OUTPUT_COMMON, 'ar_sra', 'ar_sra_daily_copay', 'is_ar_sra_eligible'],
  inputs: [],
};

/** No eligibility flag: eligibility is "subsidy > 0". */
export const CA_CONFIG: StateInputConfig = {
  code: 'CA',
  name: 'California',
  program: 'CalWORKs child care and CAPP',
  main: 'ca_child_care_subsidies',
  copay: 'ca_child_care_family_fee',
  copay_entity: 'spm_unit',
  copay_factor: 1,
  eligible: null,
  county: 'LOS_ANGELES_COUNTY_CA',
  copay_label: 'California child care family fee',
  main_label: 'California child care subsidies',
  outputs: [...OUTPUT_COMMON, 'ca_child_care_subsidies', 'ca_child_care_family_fee'],
  inputs: [],
};

/** Massachusetts splits its provider type by the child's age. */
export const MA_CONFIG: StateInputConfig = {
  code: 'MA',
  name: 'Massachusetts',
  program: 'Child Care Financial Assistance',
  main: 'ma_ccfa',
  copay: 'ma_ccfa_total_copay',
  copay_entity: 'spm_unit',
  copay_factor: 1,
  eligible: 'ma_ccfa_eligible',
  county: 'MIDDLESEX_COUNTY_MA',
  copay_label: 'Massachusetts CCFA copay',
  main_label: 'Massachusetts CCFA benefit',
  outputs: [...OUTPUT_COMMON, 'ma_ccfa', 'ma_ccfa_total_copay', 'ma_ccfa_eligible'],
  inputs: [],
};

/** A JSON `Response` for a stubbed `fetch`. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
