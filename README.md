# Child care subsidy calculator

[![CI](https://github.com/PolicyEngine/ccdf-calculator/actions/workflows/ci.yaml/badge.svg)](https://github.com/PolicyEngine/ccdf-calculator/actions/workflows/ci.yaml)
[![Data freshness](https://github.com/PolicyEngine/ccdf-calculator/actions/workflows/data-freshness.yaml/badge.svg)](https://github.com/PolicyEngine/ccdf-calculator/actions/workflows/data-freshness.yaml)

Interactive dashboard of the child care subsidy programs that all 50 states
and DC run with Child Care and Development Fund (CCDF) money, as encoded in
[PolicyEngine US](https://github.com/PolicyEngine/policyengine-us).

**Live app (planned):** policyengine.org/us/ccdf-calculator

## What it does

- **Calculator**: describe a household (parents, children's ages, earned
  income, care schedule, what the provider charges, provider type and quality
  tier) and see the monthly subsidy the state pays, the family copay and
  whether the household is eligible. Instant estimates come from a
  precomputed grid; an exact calculation calls the PolicyEngine household API.
- **Compare states**: map, ranking and table of subsidy, copay and effective
  income cutoff (in dollars, % of the federal poverty guideline and % of
  state median income) for a reference household, plus every program
  parameter as encoded with its source reference.
- **Population impact**: children and families who would qualify in each
  state from the Microcosm microsimulation, set against the children each
  state actually served in ACF's latest CCDF data tables.

See [docs/PLAN.md](docs/PLAN.md) for the design and
[docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md) for the generated data shapes.

## Layout

```
scripts/                Python data pipeline (needs policyengine-us)
  state_config.py       per-state variable contract, counties, grid settings
  calculator.py         create_situation(): the household description
  build_state_inputs.py -> public/data/state_inputs.json (provider inputs per state)
  precompute.py         -> public/data/{ST}.json + metadata.json (reference grid)
  build_compare.py      -> public/data/compare/*.json (grid re-sliced per compare cell)
  policy_index.py       -> public/data/policy_index.json (parameters + cutoffs)
  microsim.py           -> public/data/impact.json (population estimates)
  acf_served.py         -> public/data/acf_served.json (ACF caseload, hand-transcribed)
  check_data_freshness.py  compares metadata.json with the latest policyengine-us
src/                    Next.js 16 app (App Router, React 19, Recharts, react-simple-maps, @policyengine/ui-kit)
public/data/            generated JSON, committed
```

## Regenerate data

```bash
cd scripts
pip install -r requirements.txt   # or use a policyengine-us dev environment
python build_state_inputs.py
python precompute.py              # ~2 minutes for all states
python build_compare.py           # after precompute
python policy_index.py            # after precompute
python microsim.py --dataset-path ../data/populace_us_2024_year_2026.h5   # ~5 minutes, <4 GB RAM
python acf_served.py              # only after editing the transcribed ACF table
```

## Run locally

```bash
bun install
bun run dev
```

Open http://localhost:3000/us/ccdf-calculator.

## Reference-household assumptions

The precomputed grid covers 1 or 2 working adults (40 hours/week each,
earned income on the first adult) with one of five child configurations
(ages 1; 3; 7; 3 and 7; 1, 3 and 7), children under 5 in care 8 hours/day
and school-age children 3 hours/day, 5 days/week, 22 days/month, at the
state's default provider type (a licensed center) and base quality tier, in
the state's most populous county, with the provider charging $1,000 to
$3,000 per child per month. The calculator's live mode uses the exact inputs
entered instead.

## Tests

```bash
bun run lint        # eslint
bun run typecheck   # tsc --noEmit
bun run test        # vitest: grid lookup, interpolation, situation builder, API client
bun run test:py     # pytest: state contract, generated data vs docs/DATA_CONTRACT.md
```

The Python suite needs only `pytest` (`pip install -r scripts/requirements-dev.txt`);
it does not import policyengine-us. `src/lib/__fixtures__/situations.json`
pins the household description shared by `scripts/calculator.py` and
`src/lib/situation.ts`; regenerate it with
`python scripts/tests/situation_fixtures.py --write` after changing either.

CI runs all four on every pull request, plus `scripts/check_data_freshness.py`,
which warns when the committed grid lags the latest policyengine-us release.
A weekly scheduled run fails once the grid is more than five releases behind.

## License

MIT. See [LICENSE](LICENSE).
