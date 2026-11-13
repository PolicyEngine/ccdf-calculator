import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateButtonLabel,
  calculateLive,
  calculationPauseCountdown,
  fetchApiMetadata,
  householdCalculationPauseReason,
  householdCalculationPauseRemaining,
  householdCalculationPauseSeconds,
  missingVariables,
  onHouseholdCalculationPause,
  pauseHouseholdCalculations,
  SHARED_LIMIT_EXPLANATION,
  type ApiMetadata,
} from './api';
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
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { [(['spm_unit_fpg', 'hhs_smi'].includes(k) ? '2026' : '2026-10')]: v }]));
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

  it('posts the household and reads monthly outputs and converts weekly copays', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        okResult({
          md_ccs: 2000,
          md_ccs_weekly_copay: 100,
          md_ccs_eligible: true,
          spm_unit_fpg: 27000,
          hhs_smi: 100000,
          child_care_subsidies: 2000,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await calculateLive({
      config: MD_CONFIG,
      household: household(),
      year: 2026, referenceMonth: '2026-10',
      metadata: METADATA,
    });

    expect(result.subsidy).toBe(2000);
    // Weekly copay for the reference month, times 52/12 weeks.
    expect(result.copay).toBeCloseTo(100 * (52 / 12));
    expect(result.eligible).toBe(true);
    expect(result.outOfPocket).toBe(1500 * 2 - 2000);
    expect(result.fpg).toBe(27000);
    expect(result.smi).toBe(100000);
    expect(result.childCareSubsidies).toBe(2000);
    expect(result.version).toBe('1.800.0');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.policyengine.org/api/household/calculate');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.country).toBe('us');
    expect(body).not.toHaveProperty('policy');
    expect(body.household.households.household.state_code).toEqual({ '2026': 'MD' });
    expect(body.household.spm_units.spm_unit.md_ccs).toEqual({ '2026-10': null });
  });

  it('sums a person-level daily copay over children and scales by attending days', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          okResult(
            { ar_sra: 1000, is_ar_sra_eligible: true, spm_unit_fpg: 20000, hhs_smi: 80000 },
            { child_1: { ar_sra_daily_copay: 10 }, child_2: { ar_sra_daily_copay: 20 } },
          ),
        ),
      ),
    );
    const result = await calculateLive({
      config: AR_CONFIG,
      household: household({ state: 'AR', childAges: [1, 3], attendingDaysPerMonth: 18 }),
      year: 2026, referenceMonth: '2026-10',
      metadata: METADATA,
    });
    expect(result.subsidy).toBe(1000);
    expect(result.copay).toBeCloseTo((10 + 20) * 18);
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
      year: 2026, referenceMonth: '2026-10',
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
        jsonResponse(okResult({ md_ccs: 100, md_ccs_weekly_copay: 0, md_ccs_eligible: false })),
      ),
    );
    const result = await calculateLive({
      config: MD_CONFIG,
      household: household(),
      year: 2026, referenceMonth: '2026-10',
      metadata: METADATA,
    });
    expect(result.subsidy).toBe(100);
    expect(result.eligible).toBe(false);
    // No copay is owed by a family the flag says the state will not pay for.
    expect(result.copay).toBe(0);
    expect(result.outOfPocket).toBe(3000 - 100);
  });

  it('does not divide an integer monthly North Carolina fee by twelve', async () => {
    const config = { ...MD_CONFIG, code: 'NC', main: 'nc_scca', copay: 'nc_scca_parent_fee', eligible: null, copay_factor: 1, outputs: ['nc_scca', 'nc_scca_parent_fee'] };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(okResult({ nc_scca: 1421, nc_scca_parent_fee: 250 }))));
    const result = await calculateLive({ config, household: household({state: 'NC'}), year: 2026, referenceMonth: '2026-10', metadata: { version: '2.23.5', variables: new Set(config.outputs) } });
    expect(result.copay).toBe(250);
    expect(result.subsidy).toBe(1421);
  });

  it('refuses to call the API when the model lacks a required variable', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      calculateLive({
        config: MD_CONFIG,
        household: household(),
        year: 2026, referenceMonth: '2026-10',
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
      calculateLive({ config: MD_CONFIG, household: household(), year: 2026, referenceMonth: '2026-10', metadata: METADATA }),
    ).rejects.toThrow('Simulation failed');
  });

  it('reports the HTTP status when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    );
    await expect(
      calculateLive({ config: MD_CONFIG, household: household(), year: 2026, referenceMonth: '2026-10', metadata: METADATA }),
    ).rejects.toMatchObject({ message: 'The dashboard API answered HTTP 502.' });
  });
});

describe('calculateLive and the shared limit on calculations', () => {
  const SHARED_LIMIT =
    'Everyone on your network, such as a workshop or an office, shares a limit on calculations a minute';

  const MARYLAND_ANSWER = okResult({ md_ccs: 2000, md_ccs_weekly_copay: 100, md_ccs_eligible: true });

  /** The firewall's answer over its limit: text/plain, no Retry-After. */
  function tooManyRequests(): Response {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  function calculateMaryland(signal?: AbortSignal) {
    return calculateLive({
      config: MD_CONFIG,
      household: household(),
      year: 2026,
      referenceMonth: '2026-10',
      metadata: METADATA,
      signal,
    });
  }

  async function failureOf(calculation: Promise<unknown>): Promise<unknown> {
    try {
      await calculation;
    } catch (error) {
      return error;
    }
    return expect.unreachable('The calculation did not fail.');
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    // Real time first, so that ending the pause ends it in real time.
    vi.useRealTimers();
    pauseHouseholdCalculations(0);
  });

  it('exports the explanation of the shared limit', () => {
    expect(SHARED_LIMIT_EXPLANATION).toBe(SHARED_LIMIT);
  });

  it('explains the shared limit after a 429 and pauses calculations for a minute', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => tooManyRequests()));

    expect(await failureOf(calculateMaryland())).toMatchObject({
      message: `${SHARED_LIMIT}, and it has been reached.`,
      status: 429,
      rateLimited: true,
    });
    expect(householdCalculationPauseRemaining()).toBe(60_000);
    vi.advanceTimersByTime(60_000);
    expect(householdCalculationPauseRemaining()).toBe(0);
  });

  it('says the shared limit may have been reached when no answer arrives on another origin', async () => {
    // The firewall's 429 has no CORS headers, so a page on another origin,
    // such as localhost, sees a network failure instead.
    vi.useFakeTimers();
    vi.stubGlobal('location', { origin: 'http://localhost:3000' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    expect(await failureOf(calculateMaryland())).toMatchObject({
      message: `PolicyEngine's calculation service could not be reached. ${SHARED_LIMIT}, which may have been reached.`,
      status: null,
      rateLimited: true,
    });
    expect(householdCalculationPauseRemaining()).toBe(60_000);
  });

  it('reports a network failure on www.policyengine.org without pausing', async () => {
    // There the page and the dashboard API share an origin, so the
    // firewall's 429 is readable: no answer means a network failure.
    vi.stubGlobal('location', { origin: 'https://www.policyengine.org' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    expect(await failureOf(calculateMaryland())).toMatchObject({
      message: "PolicyEngine's calculation service could not be reached. Check your connection and try again.",
      status: null,
      rateLimited: false,
    });
    expect(householdCalculationPauseRemaining()).toBe(0);
  });

  it('keeps the message of another failure and does not pause after it', async () => {
    const fetchMock = vi
      .fn(async () => jsonResponse(MARYLAND_ANSWER))
      .mockImplementationOnce(async () =>
        jsonResponse({ status: 'error', message: 'Simulation failed' }, 500),
      );
    vi.stubGlobal('fetch', fetchMock);

    expect(await failureOf(calculateMaryland())).toMatchObject({
      message: 'Simulation failed',
      status: 500,
      rateLimited: false,
    });
    await expect(calculateMaryland()).resolves.toMatchObject({ subsidy: 2000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('holds back a calculation during the pause without sending a request', async () => {
    const fetchMock = vi
      .fn(async () => jsonResponse(MARYLAND_ANSWER))
      .mockImplementationOnce(async () => tooManyRequests());
    vi.stubGlobal('fetch', fetchMock);
    await failureOf(calculateMaryland());

    // The pause may have started from a request with no answer, which only
    // may have met the limit.
    expect(await failureOf(calculateMaryland())).toMatchObject({
      message: `${SHARED_LIMIT}, which may have been reached.`,
      status: null,
      rateLimited: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends calculations again once the minute has passed', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn(async () => jsonResponse(MARYLAND_ANSWER))
      .mockImplementationOnce(async () => tooManyRequests());
    vi.stubGlobal('fetch', fetchMock);
    await failureOf(calculateMaryland());

    vi.advanceTimersByTime(59_999);
    await expect(calculateMaryland()).rejects.toMatchObject({ rateLimited: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await expect(calculateMaryland()).resolves.toMatchObject({ subsidy: 2000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('pauses when one of two parallel calculations is refused after the other has failed', async () => {
    // The first calculation is refused for the limit only after the second
    // has failed for another reason, so a caller waiting on both sees only
    // the second failure.
    let answerFirstWithRefusal = () => {};
    const firstAnswer = new Promise<Response>((resolve) => {
      answerFirstWithRefusal = () => resolve(tooManyRequests());
    });
    const fetchMock = vi
      .fn(async () => jsonResponse(MARYLAND_ANSWER))
      .mockImplementationOnce(() => firstAnswer)
      .mockImplementationOnce(async () =>
        jsonResponse({ status: 'error', message: 'Simulation failed' }, 500),
      );
    vi.stubGlobal('fetch', fetchMock);

    const first = calculateMaryland();
    const second = calculateMaryland();
    await expect(Promise.all([first, second])).rejects.toThrow('Simulation failed');
    answerFirstWithRefusal();
    await failureOf(first);

    await expect(calculateMaryland()).rejects.toMatchObject({ rateLimited: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The notice gives the refusal's reason, which the caller never saw.
    expect(householdCalculationPauseReason()).toBe(`${SHARED_LIMIT}, and it has been reached.`);
  });

  it('keeps the message of the failure that started the pause as its reason', async () => {
    vi.stubGlobal('location', { origin: 'http://localhost:3000' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await failureOf(calculateMaryland());

    // A dropped connection on localhost reads the same, so the notice must
    // still say the service could not be reached.
    expect(householdCalculationPauseReason()).toBe(
      `PolicyEngine's calculation service could not be reached. ${SHARED_LIMIT}, which may have been reached.`,
    );
  });

  it('gives a pause started without a reason the message of a calculation held back', () => {
    pauseHouseholdCalculations();
    expect(householdCalculationPauseReason()).toBe(`${SHARED_LIMIT}, which may have been reached.`);

    pauseHouseholdCalculations(60_000, 'Refused for the limit.');
    expect(householdCalculationPauseReason()).toBe('Refused for the limit.');
  });

  it('rethrows a cancelled calculation unchanged and does not pause', async () => {
    const fetchMock = vi
      .fn<typeof fetch>(async () => jsonResponse(MARYLAND_ANSWER))
      .mockImplementationOnce(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const cancelled = calculateMaryland(controller.signal);
    controller.abort();

    expect(await failureOf(cancelled)).toMatchObject({ name: 'AbortError' });
    await expect(calculateMaryland()).resolves.toMatchObject({ subsidy: 2000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('tells listeners when a refusal starts a pause and when a pause is ended early', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => tooManyRequests()));
    const listener = vi.fn();
    const unsubscribe = onHouseholdCalculationPause(listener);

    await failureOf(calculateMaryland());
    expect(listener).toHaveBeenCalledTimes(1);

    pauseHouseholdCalculations(0);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(householdCalculationPauseRemaining()).toBe(0);

    unsubscribe();
    pauseHouseholdCalculations();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('counts the pause in whole seconds, rounded up', () => {
    vi.useFakeTimers();
    pauseHouseholdCalculations();
    expect(householdCalculationPauseSeconds()).toBe(60);

    vi.advanceTimersByTime(500);
    expect(householdCalculationPauseSeconds()).toBe(60);

    vi.advanceTimersByTime(58_501);
    expect(householdCalculationPauseSeconds()).toBe(1);

    vi.advanceTimersByTime(999);
    expect(householdCalculationPauseSeconds()).toBe(0);
  });

  it('labels the calculate button with the countdown during a pause', () => {
    expect(calculateButtonLabel(false, 0)).toBe('Calculate exactly');
    expect(calculateButtonLabel(true, 0)).toBe('Calculating…');
    expect(calculateButtonLabel(false, 42)).toBe('Calculate again in 42 s');
  });

  it('words the countdown that follows the explanation in the notice', () => {
    expect(calculationPauseCountdown(42)).toBe('This page can calculate again in 42 s.');
  });
});

describe('fetchApiMetadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps only the version and variable names, and fetches once', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status: 'ok',
        message: null,
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
    expect(metadataUrl).toBe('https://www.policyengine.org/api/metadata/us');
  });
});
