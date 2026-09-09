/**
 * Build the policyengine-us situation posted to the live household API.
 * Mirrors `scripts/calculator.py::create_situation` field for field; keep the
 * two in sync (see docs/DATA_CONTRACT.md).
 */

import { defaultHoursPerDay } from './dataLookup';
import type { StateInputConfig } from './types';

export type InputValue = string | number | boolean;

export interface HouseholdSpec {
  state: string;
  county?: string | null;
  adults: number;
  childAges: number[];
  hoursPerDay?: number[];
  daysPerWeek: number;
  attendingDaysPerMonth: number;
  /** Annual employment income of the first adult. */
  income: number;
  monthlyChargePerChild: number;
  weeklyHoursWorked?: number;
  inActivity: boolean;
  personInputs?: Record<string, InputValue>;
  spmInputs?: Record<string, InputValue>;
}

type PersonOverride = (age: number) => InputValue;

/**
 * Baked-in per-child overrides from `create_situation`. The model default for
 * Maryland's provider type pays nothing, and Massachusetts splits its provider
 * type by age. A user-chosen value for the same variable wins.
 */
const PERSON_OVERRIDES: Record<string, Record<string, PersonOverride>> = {
  MD: { md_ccs_provider_type: () => 'LICENSED_CENTER' },
  MA: {
    ma_ccfa_care_provider_type: (age) =>
      age < 5 ? 'CENTER_BASED_CARE_EARLY_EDUCATION' : 'CENTER_BASED_CARE_SCHOOL_AGE',
  },
};

type YearMap = Record<string, InputValue | null>;
type Entity = Record<string, YearMap | string[]>;

export interface Situation {
  people: Record<string, Entity>;
  families: Record<string, { members: string[] }>;
  marital_units: Record<string, { members: string[] }>;
  tax_units: Record<string, { members: string[] }>;
  spm_units: Record<string, Entity>;
  households: Record<string, Entity>;
}

export function buildSituation(
  config: StateInputConfig,
  household: HouseholdSpec,
  year: number,
  /** When given, variables absent from the live model are dropped. */
  availableVariables?: Set<string> | null,
): Situation {
  const y = String(year);
  const known = (name: string) => !availableVariables || availableVariables.has(name);
  const childAges = household.childAges;
  const hoursPerDay =
    household.hoursPerDay && household.hoursPerDay.length === childAges.length
      ? household.hoursPerDay
      : childAges.map(defaultHoursPerDay);

  const people: Record<string, Entity> = {};
  const members: string[] = [];

  const adults = Math.min(Math.max(household.adults, 1), 2);
  for (let i = 0; i < adults; i += 1) {
    const id = `adult_${i + 1}`;
    people[id] = {
      age: { [y]: 35 },
      weekly_hours_worked_before_lsr: { [y]: household.weeklyHoursWorked ?? 40 },
      employment_income: { [y]: i === 0 ? household.income : 0 },
    };
    members.push(id);
  }

  const overrides = PERSON_OVERRIDES[household.state] ?? {};
  childAges.forEach((age, i) => {
    const id = `child_${i + 1}`;
    const person: Entity = {
      age: { [y]: age },
      childcare_hours_per_day: { [y]: hoursPerDay[i] },
      childcare_days_per_week: { [y]: household.daysPerWeek },
      childcare_attending_days_per_month: { [y]: household.attendingDaysPerMonth },
    };
    Object.entries(overrides).forEach(([variable, resolve]) => {
      if (known(variable)) person[variable] = { [y]: resolve(age) };
    });
    Object.entries(household.personInputs ?? {}).forEach(([variable, value]) => {
      if (known(variable)) person[variable] = { [y]: value };
    });
    people[id] = person;
    members.push(id);
  });

  const spmUnit: Entity = {
    members,
    spm_unit_pre_subsidy_childcare_expenses: {
      [y]: household.monthlyChargePerChild * 12 * childAges.length,
    },
  };
  if (known('meets_ccdf_activity_test')) {
    spmUnit.meets_ccdf_activity_test = { [y]: household.inActivity };
  }
  Object.entries(household.spmInputs ?? {}).forEach(([variable, value]) => {
    if (known(variable)) spmUnit[variable] = { [y]: value };
  });

  // Requested outputs are the SPM-unit keys set to null, except the copay when
  // the state defines it on the person.
  config.outputs.forEach((variable) => {
    if (!known(variable)) return;
    if (variable === config.copay && config.copay_entity === 'person') return;
    if (spmUnit[variable] === undefined) spmUnit[variable] = { [y]: null };
  });
  if (config.copay_entity === 'person' && known(config.copay)) {
    childAges.forEach((_, i) => {
      const person = people[`child_${i + 1}`];
      person[config.copay] = { [y]: null };
    });
  }

  const household_: Entity = { members, state_code: { [y]: household.state } };
  const county = household.county ?? config.county;
  if (county) household_.county = { [y]: county };

  return {
    people,
    families: { family: { members } },
    marital_units: { marital_unit: { members: members.slice(0, adults) } },
    tax_units: { tax_unit: { members } },
    spm_units: { spm_unit: spmUnit },
    households: { household: household_ },
  };
}
