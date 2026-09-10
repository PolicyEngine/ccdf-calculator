import { describe, expect, it } from 'vitest';
import { buildSituation, type HouseholdSpec } from './situation';
import { AR_CONFIG, CA_CONFIG, MA_CONFIG, MD_CONFIG } from './__fixtures__/data';

const Y = '2026';

function household(overrides: Partial<HouseholdSpec> = {}): HouseholdSpec {
  return {
    state: 'MD',
    adults: 1,
    childAges: [3, 7],
    daysPerWeek: 5,
    attendingDaysPerMonth: 22,
    income: 30000,
    monthlyChargePerChild: 1500,
    inActivity: true,
    ...overrides,
  };
}

describe('buildSituation: adults', () => {
  it('gives the first adult the income and puts only adults in the marital unit', () => {
    const situation = buildSituation(MD_CONFIG, household({ adults: 2 }), 2026);
    expect(situation.people.adult_1.employment_income).toEqual({ [Y]: 30000 });
    expect(situation.people.adult_2.employment_income).toEqual({ [Y]: 0 });
    expect(situation.people.adult_1.weekly_hours_worked_before_lsr).toEqual({ [Y]: 40 });
    expect(situation.marital_units.marital_unit.members).toEqual(['adult_1', 'adult_2']);
    expect(situation.tax_units.tax_unit.members).toEqual([
      'adult_1',
      'adult_2',
      'child_1',
      'child_2',
    ]);
  });

  it('clamps the adult count to 1 or 2 and honours custom hours', () => {
    const none = buildSituation(MD_CONFIG, household({ adults: 0 }), 2026);
    expect(Object.keys(none.people).filter((id) => id.startsWith('adult_'))).toEqual(['adult_1']);
    const many = buildSituation(MD_CONFIG, household({ adults: 4, weeklyHoursWorked: 25 }), 2026);
    expect(Object.keys(many.people).filter((id) => id.startsWith('adult_'))).toEqual([
      'adult_1',
      'adult_2',
    ]);
    expect(many.people.adult_2.weekly_hours_worked_before_lsr).toEqual({ [Y]: 25 });
  });
});

describe('buildSituation: children and care schedule', () => {
  it('defaults hours by age and copies the schedule onto every child', () => {
    const situation = buildSituation(MD_CONFIG, household(), 2026);
    expect(situation.people.child_1.childcare_hours_per_day).toEqual({ [Y]: 8 });
    expect(situation.people.child_2.childcare_hours_per_day).toEqual({ [Y]: 3 });
    expect(situation.people.child_2.childcare_days_per_week).toEqual({ [Y]: 5 });
    expect(situation.people.child_2.childcare_attending_days_per_month).toEqual({ [Y]: 22 });
  });

  it('uses explicit hours when one value is given per child, else falls back to defaults', () => {
    const explicit = buildSituation(MD_CONFIG, household({ hoursPerDay: [6, 4] }), 2026);
    expect(explicit.people.child_1.childcare_hours_per_day).toEqual({ [Y]: 6 });
    expect(explicit.people.child_2.childcare_hours_per_day).toEqual({ [Y]: 4 });
    const mismatched = buildSituation(MD_CONFIG, household({ hoursPerDay: [6] }), 2026);
    expect(mismatched.people.child_1.childcare_hours_per_day).toEqual({ [Y]: 8 });
  });

  it('annualises the provider charge across all children on the SPM unit', () => {
    const situation = buildSituation(
      MD_CONFIG,
      household({ childAges: [1, 3, 7], monthlyChargePerChild: 2000 }),
      2026,
    );
    expect(situation.spm_units.spm_unit.spm_unit_pre_subsidy_childcare_expenses).toEqual({
      [Y]: 2000 * 12 * 3,
    });
    expect(situation.spm_units.spm_unit.members).toEqual([
      'adult_1',
      'child_1',
      'child_2',
      'child_3',
    ]);
  });

  it('passes the activity test flag through', () => {
    const situation = buildSituation(MD_CONFIG, household({ inActivity: false }), 2026);
    expect(situation.spm_units.spm_unit.meets_ccdf_activity_test).toEqual({ [Y]: false });
  });
});

describe('buildSituation: state overrides', () => {
  it("sets Maryland's provider type because the model default pays nothing", () => {
    const situation = buildSituation(MD_CONFIG, household(), 2026);
    expect(situation.people.child_1.md_ccs_provider_type).toEqual({ [Y]: 'LICENSED_CENTER' });
    expect(situation.people.child_2.md_ccs_provider_type).toEqual({ [Y]: 'LICENSED_CENTER' });
  });

  it('lets a user-chosen value win over the baked-in override', () => {
    const situation = buildSituation(
      MD_CONFIG,
      household({ personInputs: { md_ccs_provider_type: 'INFORMAL' } }),
      2026,
    );
    expect(situation.people.child_1.md_ccs_provider_type).toEqual({ [Y]: 'INFORMAL' });
  });

  it("splits Massachusetts' provider type by the child's age", () => {
    const situation = buildSituation(
      MA_CONFIG,
      household({ state: 'MA', childAges: [2, 9] }),
      2026,
    );
    expect(situation.people.child_1.ma_ccfa_care_provider_type).toEqual({
      [Y]: 'CENTER_BASED_CARE_EARLY_EDUCATION',
    });
    expect(situation.people.child_2.ma_ccfa_care_provider_type).toEqual({
      [Y]: 'CENTER_BASED_CARE_SCHOOL_AGE',
    });
  });

  it('adds no override for other states', () => {
    const situation = buildSituation(CA_CONFIG, household({ state: 'CA' }), 2026);
    expect(situation.people.child_1.md_ccs_provider_type).toBeUndefined();
    expect(situation.people.child_1.ma_ccfa_care_provider_type).toBeUndefined();
  });

  it('applies SPM-unit inputs such as the enrollment flag', () => {
    const situation = buildSituation(
      MD_CONFIG,
      household({ spmInputs: { md_ccs_enrolled: true } }),
      2026,
    );
    expect(situation.spm_units.spm_unit.md_ccs_enrolled).toEqual({ [Y]: true });
  });
});

describe('buildSituation: requested outputs', () => {
  it('requests every output as null on the SPM unit', () => {
    const situation = buildSituation(MD_CONFIG, household(), 2026);
    const unit = situation.spm_units.spm_unit;
    MD_CONFIG.outputs.forEach((variable) => expect(unit[variable]).toEqual({ [Y]: null }));
  });

  it('requests a person-level copay on each child instead of the SPM unit', () => {
    const situation = buildSituation(
      AR_CONFIG,
      household({ state: 'AR', childAges: [1, 3] }),
      2026,
    );
    expect(situation.people.child_1.ar_sra_daily_copay).toEqual({ [Y]: null });
    expect(situation.people.child_2.ar_sra_daily_copay).toEqual({ [Y]: null });
    expect(situation.spm_units.spm_unit.ar_sra_daily_copay).toBeUndefined();
    expect(situation.spm_units.spm_unit.ar_sra).toEqual({ [Y]: null });
  });

  it('does not overwrite an input that is also listed as an output', () => {
    const config = { ...MD_CONFIG, outputs: [...MD_CONFIG.outputs, 'md_ccs_enrolled'] };
    const situation = buildSituation(
      config,
      household({ spmInputs: { md_ccs_enrolled: true } }),
      2026,
    );
    expect(situation.spm_units.spm_unit.md_ccs_enrolled).toEqual({ [Y]: true });
  });
});

describe('buildSituation: variables missing from the live model', () => {
  it('drops inputs, overrides and outputs the deployed model does not know', () => {
    const available = new Set([
      'age',
      'employment_income',
      'md_ccs',
      'md_ccs_weekly_copay',
      'spm_unit_fpg',
    ]);
    const situation = buildSituation(
      MD_CONFIG,
      household({ spmInputs: { md_ccs_enrolled: true } }),
      2026,
      available,
    );
    const unit = situation.spm_units.spm_unit;
    expect(unit.meets_ccdf_activity_test).toBeUndefined();
    expect(unit.md_ccs_enrolled).toBeUndefined();
    expect(unit.md_ccs_eligible).toBeUndefined();
    expect(unit.child_care_subsidies).toBeUndefined();
    expect(unit.md_ccs).toEqual({ [Y]: null });
    expect(situation.people.child_1.md_ccs_provider_type).toBeUndefined();
  });

  it('keeps everything when no variable list is given', () => {
    const situation = buildSituation(MD_CONFIG, household(), 2026, null);
    expect(situation.spm_units.spm_unit.meets_ccdf_activity_test).toEqual({ [Y]: true });
  });
});

describe('buildSituation: location', () => {
  it("uses the state code and the config's county by default", () => {
    const situation = buildSituation(MD_CONFIG, household(), 2026);
    expect(situation.households.household.state_code).toEqual({ [Y]: 'MD' });
    expect(situation.households.household.county).toEqual({ [Y]: 'MONTGOMERY_COUNTY_MD' });
  });

  it('prefers an explicit county and omits the key when there is none', () => {
    const explicit = buildSituation(
      MD_CONFIG,
      household({ county: 'BALTIMORE_CITY_MD' }),
      2026,
    );
    expect(explicit.households.household.county).toEqual({ [Y]: 'BALTIMORE_CITY_MD' });
    const none = buildSituation(
      { ...MD_CONFIG, county: null },
      household({ county: null }),
      2026,
    );
    expect(none.households.household.county).toBeUndefined();
  });
});
