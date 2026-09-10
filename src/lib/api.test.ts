import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateLive, fetchApiMetadata, missingVariables, type ApiMetadata } from './api';
import type { HouseholdSpec } from './situation';
import { AR_CONFIG, CA_CONFIG, MD_CONFIG, jsonResponse } from './__fixtures__/data';

const ALL_VARIABLES = new Set([
  'age',
  'employment_income',
  'weekly_hours_worked_before_lsr',
  'childcare_hours_per_day',
  'childcare_days_per_week',
  'childcare_attending_days_per_month',
  'spm_unit_pre_subsidy_childcare_expenses',
  'meets_ccdf_activity_test',
  'state_code',
  'county',
  'child_care_subsidies',
  'spm_unit_fpg',
  'hhs_smi',
  ...MD_CONFIG.outputs,
  ...AR_CONFIG.outputs,
  ...CA_CONFIG.outputs,
  'md_ccs_provider_type',
  'md_ccs_enrolled',
]);

const METADATA: ApiMetadata = { version: '1.800.0', variables: ALL_VARIABLES };

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

function okResult(spmUnit: Record<string, number | boolean>, people: Record<string, Record<string, number>> = {}) {
  const wrap = (values: Record<string, number | boolean>) =>
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { '2026': v }]));
  return {
    status: 'ok',
    result: {
      spm_units: { spm_unit: wrap(spmUnit) },
      people: Object.fromEntries(Object.entries(people).map(([id, values]) => [id, wrap(values)])),
    },
  };
}

describe('missingVariables', () => {
  it('lists the main, copay and eligibility variables the model lacks', () => {
    expect(missingVariables(MD_CONFIG, METADATA)).toEqual([]);
    const without = { ...METADATA, variables: new Set(['md_ccs']) };
    expect(missingVariables(MD_CONFIG, without)).toEqual(['md_ccs_weekly_copay', 'md_ccs_eligible']);
  });

  it('does not require an eligibility variable the state does not define', () => {
    const only = { ...METADATA, variables: new Set(CA_CONFIG.outputs) };
    expect(missingVariables(CA_CONFIG, only)).toEqual([]);
  });
});

describe('calculateLive', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the household and converts annual results to monthly figures', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        okResult({
          md_ccs: 24000,
          md_ccs_weekly_copay: 1200,
          md_ccs_eligible: true,
          spm_unit_fpg: 27000,
          hhs_smi: 100000,
          child_care_subsidies: 24000,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await calculateLive({
      config: MD_CONFIG,
      household: household(),
      year: 2026,
      metadata: METADATA,
    });

    expect(result.subsidy).toBe(2000);
    // Weekly copay: annual sum / 12 gives a weekly amount, times 52/12 weeks.
    expect(result.copay).toBeCloseTo((1200 / 12) * (52 / 12));
    expect(result.eligible).toBe(true);
    expect(result.outOfPocket).toBe(1500 * 2 - 2000);
    expect(result.fpg).toBe(27000);
    expect(result.smi).toBe(100000);
    expect(result.childCareSubsidies).toBe(2000);
    expect(result.version).toBe('1.800.0');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.policyengine.org/us/calculate');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.household.households.household.state_code).toEqual({ '2026': 'MD' });
    expect(body.household.spm_units.spm_unit.md_ccs).toEqual({ '2026': null });
  });

  it('sums a person-level daily copay over children and scales by attending days', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          okResult(
            { ar_sra: 12000, is_ar_sra_eligible: true, spm_unit_fpg: 20000, hhs_smi: 80000 },
            { child_1: { ar_sra_daily_copay: 120 }, child_2: { ar_sra_daily_copay: 240 } },
          ),
        ),
      ),
    );
    const result = await calculateLive({
      config: AR_CONFIG,
      household: household({ state: 'AR', childAges: [1, 3], attendingDaysPerMonth: 18 }),
      year: 2026,
      metadata: METADATA,
    });
    expect(result.subsidy).toBe(1000);
    expect(result.copay).toBeCloseTo(((120 + 240) / 12) * 18);
  });

  it('infers eligibility from a positive subsidy when the state has no flag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(okResult({ ca_child_care_subsidies: 0, ca_child_care_family_fee: 0 })),
      ),
    );
    const result = await calculateLive({
      config: CA_CONFIG,
      household: household({ state: 'CA' }),
      year: 2026,
      metadata: METADATA,
    });
    expect(result.subsidy).toBe(0);
    expect(result.eligible).toBe(false);
    expect(result.copay).toBe(0);
    expect(result.outOfPocket).toBe(3000);
    // Variables absent from the response read as zero, not NaN.
    expect(result.fpg).toBe(0);
  });

  it('honours an explicit false eligibility flag even when money is paid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(okResult({ md_ccs: 1200, md_ccs_weekly_copay: 0, md_ccs_eligible: false })),
      ),
    );
    const result = await calculateLive({
      config: MD_CONFIG,
      household: household(),
      year: 2026,
      metadata: METADATA,
    });
    expect(result.subsidy).toBe(100);
    expect(result.eligible).toBe(false);
    // No copay is owed by a family the flag says the state will not pay for.
    expect(result.copay).toBe(0);
    expect(result.outOfPocket).toBe(3000 - 100);
  });

  it('refuses to call the API when the model lacks a required variable', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      calculateLive({
        config: MD_CONFIG,
        household: household(),
        year: 2026,
        metadata: { version: '1.764.6', variables: new Set(['md_ccs']) },
      }),
    ).rejects.toThrow('1.764.6, which does not include md_ccs_weekly_copay, md_ccs_eligible');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the API's own error message", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: 'error', message: 'Simulation failed' }, 500)),
    );
    await expect(
      calculateLive({ config: MD_CONFIG, household: household(), year: 2026, metadata: METADATA }),
    ).rejects.toThrow('Simulation failed');
  });

  it('reports the HTTP status when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    );
    await expect(
      calculateLive({ config: MD_CONFIG, household: household(), year: 2026, metadata: METADATA }),
    ).rejects.toThrow('The PolicyEngine API returned 502.');
  });
});

describe('fetchApiMetadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps only the version and variable names, and fetches once', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        result: {
          version: '1.764.6',
          variables: { md_ccs: { label: 'x' }, employment_income: { label: 'y' } },
          parameters: { huge: true },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchApiMetadata();
    expect(first.version).toBe('1.764.6');
    expect(first.variables).toEqual(new Set(['md_ccs', 'employment_income']));

    const second = await fetchApiMetadata();
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [metadataUrl] = fetchMock.mock.calls[0] as unknown as [string];
    expect(metadataUrl).toBe('https://api.policyengine.org/us/metadata');
  });
});
