import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  childStructureKey,
  compareStates,
  defaultHoursPerDay,
  estimate,
  incomeSeries,
  interpolate,
  loadPolicyIndex,
  nearestChargeIndex,
  referenceGaps,
  structureComparison,
  structureKey,
} from './dataLookup';
import { INCOME_STEPS, jsonResponse, makeMetadata, makeStateData } from './__fixtures__/data';
import type { PolicyIndex } from './types';

describe('reference-structure matching', () => {
  it('maps ages onto the five child structures', () => {
    expect(childStructureKey([0])).toBe('infant');
    expect(childStructureKey([1])).toBe('infant');
    expect(childStructureKey([2])).toBe('preschool');
    expect(childStructureKey([4])).toBe('preschool');
    expect(childStructureKey([5])).toBe('school');
    expect(childStructureKey([12])).toBe('school');
    expect(childStructureKey([3, 7])).toBe('two');
    expect(childStructureKey([9, 1])).toBe('two');
    expect(childStructureKey([1, 3, 7])).toBe('three');
    expect(childStructureKey([1, 2, 3, 4, 5])).toBe('three');
  });

  it('reads no children as a preschooler', () => {
    expect(childStructureKey([])).toBe('preschool');
  });

  it('clamps adults to the 1 to 2 range in the structure key', () => {
    expect(structureKey(1, 'two')).toBe('1_two');
    expect(structureKey(0, 'two')).toBe('1_two');
    expect(structureKey(2, 'infant')).toBe('2_infant');
    expect(structureKey(5, 'infant')).toBe('2_infant');
  });

  it('gives under-fives full-time hours and school-age children after-school hours', () => {
    expect(defaultHoursPerDay(1)).toBe(8);
    expect(defaultHoursPerDay(4)).toBe(8);
    expect(defaultHoursPerDay(5)).toBe(3);
    expect(defaultHoursPerDay(12)).toBe(3);
  });

  it('picks the closest charge level, the first on a tie', () => {
    const meta = makeMetadata(); // 1000, 1500, 2000
    expect(nearestChargeIndex(meta, 1200)).toBe(0);
    expect(nearestChargeIndex(meta, 1250)).toBe(0);
    expect(nearestChargeIndex(meta, 1300)).toBe(1);
    expect(nearestChargeIndex(meta, 2600)).toBe(2);
    expect(nearestChargeIndex(meta, 0)).toBe(0);
  });
});

describe('interpolate', () => {
  const series = INCOME_STEPS.map((_, i) => 100 * i); // 0, 100, ..., 1000

  it('returns grid values exactly at the grid points', () => {
    expect(interpolate(series, INCOME_STEPS, 0)).toBe(0);
    expect(interpolate(series, INCOME_STEPS, 3000)).toBe(300);
    expect(interpolate(series, INCOME_STEPS, 10000)).toBe(1000);
  });

  it('interpolates linearly between points', () => {
    expect(interpolate(series, INCOME_STEPS, 1500)).toBe(150);
    expect(interpolate(series, INCOME_STEPS, 4250)).toBe(425);
  });

  it('clamps incomes outside the axis to the ends', () => {
    expect(interpolate(series, INCOME_STEPS, -5000)).toBe(0);
    expect(interpolate(series, INCOME_STEPS, 250000)).toBe(1000);
  });

  it('never returns a negative amount and tolerates an empty series', () => {
    expect(interpolate([-10, -20], [0, 1000], 500)).toBe(0);
    expect(interpolate([], INCOME_STEPS, 500)).toBe(0);
  });
});

describe('estimate', () => {
  const meta = makeMetadata();
  const state = makeStateData();

  it('reads the matching structure and interpolates subsidy and copay', () => {
    // 1_two at charge index 1: subsidy = 200 * (10 - i), copay = 10 * i.
    const result = estimate(meta, state, {
      adults: 1,
      childAges: [3, 7],
      income: 5000,
      monthlyChargePerChild: 1600,
    });
    expect(result).not.toBeNull();
    expect(result!.key).toBe('1_two');
    expect(result!.childKey).toBe('two');
    expect(result!.chargeIndex).toBe(1);
    expect(result!.chargeLevel).toBe(1500);
    expect(result!.subsidy).toBe(1000);
    expect(result!.copay).toBe(50);
    expect(result!.eligible).toBe(true);
  });

  it('computes out of pocket from the entered charge, not the grid level', () => {
    const result = estimate(meta, state, {
      adults: 1,
      childAges: [3, 7],
      income: 5000,
      monthlyChargePerChild: 1600,
    });
    expect(result!.outOfPocket).toBe(1600 * 2 - 1000);
  });

  it('never reports negative out of pocket', () => {
    const result = estimate(meta, state, {
      adults: 2,
      childAges: [3, 7],
      income: 0,
      monthlyChargePerChild: 1000,
    });
    // 2_two at index 0: subsidy 2 * 100 * 10 = 2000 against a 2000 charge.
    expect(result!.subsidy).toBe(2000);
    expect(result!.outOfPocket).toBe(0);
  });

  it('reports income as a share of the unit FPG and SMI', () => {
    const result = estimate(meta, state, {
      adults: 1,
      childAges: [3],
      income: 27000,
      monthlyChargePerChild: 1500,
    });
    expect(result!.fpg).toBe(27000);
    expect(result!.incomeShareOfFpg).toBe(1);
    expect(result!.incomeShareOfSmi).toBeCloseTo(0.27);
  });

  it('reads eligibility from the nearest income step and turns false past the cutoff', () => {
    const result = estimate(meta, state, {
      adults: 1,
      childAges: [3],
      income: 9600, // nearest step is 10000, where the subsidy is zero
      monthlyChargePerChild: 1500,
    });
    expect(result!.eligible).toBe(false);
    expect(result!.subsidy).toBeCloseTo(80); // interpolated between 200 and 0
  });

  it('returns null when the state file lacks the structure', () => {
    const partial = { ...state, structures: { '1_infant': state.structures['1_infant'] } };
    expect(
      estimate(meta, partial, { adults: 1, childAges: [3, 7], income: 0, monthlyChargePerChild: 1500 }),
    ).toBeNull();
  });
});

describe('chart series', () => {
  const meta = makeMetadata();
  const state = makeStateData();

  it('emits one point per income step with subsidy and copay', () => {
    const series = incomeSeries(meta, state, '1_two', 1);
    expect(series).toHaveLength(INCOME_STEPS.length);
    expect(series[0]).toEqual({ income: 0, subsidy: 2000, copay: 0 });
    expect(series[10]).toEqual({ income: 10000, subsidy: 0, copay: 100 });
  });

  it('is empty for an unknown structure', () => {
    expect(incomeSeries(meta, state, '9_none', 1)).toEqual([]);
  });

  it('compares every child structure at one income', () => {
    const rows = structureComparison(meta, state, 2, 0, 5000);
    expect(rows.map((row) => row.childKey)).toEqual([
      'infant',
      'preschool',
      'school',
      'two',
      'three',
    ]);
    // 2 adults, charge index 0, income 5000: 2 * 100 * 5 = 1000 for every structure.
    rows.forEach((row) => expect(row.subsidy).toBe(1000));
    expect(rows[0].label).toBe('One infant (age 1)');
  });

  it('shows zero for a structure the state file lacks', () => {
    const partial = { ...state, structures: { '1_infant': state.structures['1_infant'] } };
    const rows = structureComparison(meta, partial, 1, 1, 0);
    expect(rows.find((row) => row.childKey === 'infant')!.subsidy).toBe(2000);
    expect(rows.find((row) => row.childKey === 'two')!.subsidy).toBe(0);
  });
});

describe('referenceGaps', () => {
  const meta = makeMetadata();
  const reference = {
    adults: 1,
    childAges: [3, 7],
    hoursPerDay: [8, 3],
    daysPerWeek: 5,
    attendingDaysPerMonth: 22,
    monthlyChargePerChild: 1500,
    inActivity: true,
  };

  it('is empty when the household is the reference household', () => {
    expect(referenceGaps(meta, reference, 1)).toEqual([]);
  });

  it('names each way the household differs', () => {
    const gaps = referenceGaps(
      meta,
      {
        ...reference,
        childAges: [2, 9],
        hoursPerDay: [6, 3],
        daysPerWeek: 4,
        attendingDaysPerMonth: 18,
        monthlyChargePerChild: 1700,
        inActivity: false,
      },
      1,
    );
    expect(gaps).toEqual([
      'Ages are read as 3 and 7, not 2 and 9.',
      'Care hours are read as 8 and 3 per day.',
      'Care is read as 5 days per week.',
      'Attendance is read as 22 days per month.',
      'The provider charge is rounded to the nearest grid level, $1,500 per child per month.',
      'The grid assumes the parents meet the work or activity test.',
    ]);
  });

  it('explains when more children are entered than the grid covers', () => {
    const gaps = referenceGaps(
      meta,
      { ...reference, childAges: [1, 3, 7, 9], hoursPerDay: [8, 8, 3, 3] },
      1,
    );
    expect(gaps[0]).toBe('The grid covers 3 children, not 4.');
    expect(gaps[1]).toBe('Care hours are read as 8 and 8 and 3 per day.');
  });
});

describe('compareStates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('evaluates one grid cell per state and reads cutoffs from the policy index', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/data/AA.json')) return jsonResponse(makeStateData('AA'));
        return new Response('not found', { status: 404 });
      }),
    );
    const meta = makeMetadata();
    const policy: PolicyIndex = {
      year: 2026,
      states: {
        AA: {
          code: 'AA',
          name: 'Alpha',
          program: 'Alpha Child Care',
          parameter_root: 'gov.states.aa',
          parameters_used: [],
          parameters: [],
          thresholds: {
            '1_two': {
              income: 10000,
              fpg_ratio: 0.37,
              smi_ratio: 0.1,
              max_subsidy: 2000,
              subsidy_at_zero_income: 2000,
            },
          },
        },
        BB: {
          code: 'BB',
          name: 'Beta',
          program: 'Beta Child Care',
          parameter_root: 'gov.states.bb',
          parameters_used: [],
          parameters: [],
          thresholds: { '1_two': null },
        },
      },
    };

    const rows = await compareStates(meta, policy, '1_two', 1, 5000);
    expect(rows).toHaveLength(2);

    const aa = rows.find((row) => row.code === 'AA')!;
    expect(aa.subsidy).toBe(1000);
    expect(aa.copay).toBe(50);
    expect(aa.eligible).toBe(true);
    expect(aa.cutoffIncome).toBe(10000);
    expect(aa.cutoffShareOfFpg).toBe(0.37);
    // The cutoff sits on the top of the income axis, so it is "at least".
    expect(aa.cutoffBeyondAxis).toBe(true);

    const bb = rows.find((row) => row.code === 'BB')!;
    expect(bb.subsidy).toBeNull();
    expect(bb.copay).toBeNull();
    expect(bb.eligible).toBe(false);
    expect(bb.cutoffIncome).toBeNull();
    expect(bb.cutoffBeyondAxis).toBe(false);
  });
});

describe('loadPolicyIndex', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses Python's bare Infinity tokens", async () => {
    const text =
      '{"year": 2026, "states": {"AA": {"thresholds": {}, "parameters": [' +
      '{"path": "p", "label": "l", "scale": [{"threshold": -Infinity, "amount": 1}, ' +
      '{"threshold": Infinity, "amount": 2}]}]}}}';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(text, { status: 200 })),
    );
    const index = await loadPolicyIndex();
    const scale = index.states.AA.parameters[0].scale!;
    expect(scale[0].threshold).toBe(-Infinity);
    expect(scale[1].threshold).toBe(Infinity);
  });
});
