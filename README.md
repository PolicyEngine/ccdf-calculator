# Child care subsidy calculator

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
- **Population impact**: eligible children, families and subsidy dollars by
  state from the Microcosm microsimulation (secondary; generated separately).

See [docs/PLAN.md](docs/PLAN.md) for the design and
[docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md) for the generated data shapes.

## Layout

```
scripts/                Python data pipeline (needs policyengine-us)
  state_config.py       per-state variable contract, counties, grid settings
  calculator.py         create_situation(): the household description
  build_state_inputs.py -> public/data/state_inputs.json (provider inputs per state)
  precompute.py         -> public/data/{ST}.json + metadata.json (reference grid)
  policy_index.py       -> public/data/policy_index.json (parameters + cutoffs)
  microsim.py           -> public/data/impact.json (population estimates)
src/                    Next.js 16 app (App Router, React 19, Recharts, react-simple-maps, @policyengine/ui-kit)
public/data/            generated JSON, committed
```

## Regenerate data

```bash
cd scripts
pip install -r requirements.txt   # or use a policyengine-us dev environment
python build_state_inputs.py
python precompute.py              # ~1 minute for all states
python policy_index.py            # after precompute
python microsim.py                # optional, needs `policyengine[us]` and tens of GB RAM
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

## License

MIT. See [LICENSE](LICENSE).
