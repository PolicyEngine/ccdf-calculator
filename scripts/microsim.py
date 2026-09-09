"""Population estimates of child care subsidy eligibility and dollars by state.

Runs the Microcosm-based microsimulation through the `policyengine` package
(certified model + data bundle) and writes public/data/impact.json.

Why imputation is needed
------------------------
The CPS-based dataset carries the SPM unit's pre-subsidy child care expenses
(`spm_unit_pre_subsidy_childcare_expenses`, from SPM_CHILDCAREXPNS) and each
adult's usual weekly hours, but not the per-child care schedule inputs the
state formulas read (`childcare_hours_per_day`, `childcare_days_per_week`,
`childcare_attending_days_per_month`), nor `meets_ccdf_activity_test`, nor
the state provider-type enums. Left at their defaults (0 hours, False), every
state pays nothing. This script imputes:

  * every child under 13 is placed in full-time care (8 h/day under 5,
    3 h/day at 5-12, 5 days/week, 22 attending days/month) at a provider
    charging ASSUMED_CHARGE per child per month, or the unit's reported
    expenses if higher;
  * `meets_ccdf_activity_test` is True when every adult in the SPM unit
    reports usual weekly hours of at least 20 (or the unit has no adults);
  * provider inputs stay at the model defaults, except Maryland's provider
    type (set to a licensed center) and Massachusetts' care type by age,
    matching scripts/calculator.py.

Two measures come out of that:

  * **eligible population** (headline): children under 13 whose parents pass
    the activity test and whose family the model would pay a positive
    subsidy if the child were in full-time care. This mirrors how federal
    eligibility estimates are built (ACF's "federally eligible children")
    and does not depend on whether the family currently pays for care.
    `potential_annual_subsidy` is the model's payment if every one of them
    used care at the assumed charge: an upper bound, not spending.
  * **paid-care subset**: the same, restricted to units that report positive
    child care expenses in the survey (mode `paid_care`). This is the
    closer analogue to a caseload, but CPS expense reporters skew high
    income and small states have only tens of sampled units, so per-state
    values are noisy; `sample_units` is reported so the UI can grey them.

Neither is a caseload. Actual CCDF caseloads are far lower because of
funding limits, waitlists and take-up.

Requirements
------------
    uv pip install "policyengine[us]"
Tens of GB of RAM and several minutes. Run one at a time.

Model version
-------------
The `policyengine` package pins a certified policyengine-us that can lag the
repo (5.3.0 pins 1.764.6, which lacks 14 of the 51 state programs). Pass
`--dataset-path` to a dataset file downloaded by `pe.us.ensure_datasets`
(see download_dataset.py) to run the same data through whichever
policyengine-us is installed in the current environment, e.g. the dev
checkout. The output records both versions.

Usage
-----
    python microsim.py [--year 2026]                    # certified bundle
    python microsim.py --dataset-path data/....h5       # certified data, local model
"""

import argparse
import importlib.metadata
import json
import os

import numpy as np

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "data", "impact.json")
ASSUMED_CHARGE = 1_500  # $/child/month, matches the calculator default
MIN_SAMPLE_UNITS = 30

STATE_OVERRIDES = {
    "MD": ("md_ccs_provider_type", lambda age: "LICENSED_CENTER"),
    "MA": (
        "ma_ccfa_care_provider_type",
        lambda age: "CENTER_BASED_CARE_EARLY_EDUCATION" if age < 5 else "CENTER_BASED_CARE_SCHOOL_AGE",
    ),
}


def impute_inputs(sim, year, mode="eligible"):
    """Set the care-schedule and activity inputs on a country-package
    Microsimulation before calculating subsidies.

    mode "eligible": every child under 13 is in full-time care at
    ASSUMED_CHARGE (or the reported expenses if higher).
    mode "paid_care": only children in units reporting positive expenses,
    at the reported expenses.
    """
    age = np.asarray(sim.calculate("age", period=year))
    state = np.asarray(sim.calculate("state_code_str", period=year, map_to="person"))
    unit_expenses = np.asarray(sim.calculate("spm_unit_pre_subsidy_childcare_expenses", period=year))
    spm = sim.populations["spm_unit"]
    n_young = np.asarray(spm.sum((age < 13).astype(float)))
    if mode == "eligible":
        assumed = ASSUMED_CHARGE * 12 * n_young
        sim.set_input(
            "spm_unit_pre_subsidy_childcare_expenses", year, np.maximum(unit_expenses, assumed)
        )
        in_care = age < 13
    else:
        has_expenses = np.asarray(spm.project(unit_expenses > 0))
        in_care = (age < 13) & has_expenses
    hours = np.where(age < 5, 8.0, 3.0) * in_care
    sim.set_input("childcare_hours_per_day", year, hours)
    sim.set_input("childcare_days_per_week", year, 5.0 * in_care)
    sim.set_input("childcare_attending_days_per_month", year, (22 * in_care).astype(int))

    weekly_hours = np.asarray(sim.calculate("weekly_hours_worked_before_lsr", period=year))
    is_adult = age >= 18
    adult_works = np.where(is_adult, weekly_hours >= 20, True)
    all_adults_work = np.asarray(
        sim.populations["spm_unit"].all(adult_works)
    )
    sim.set_input("meets_ccdf_activity_test", year, all_adults_work)

    for st, (var, fn) in STATE_OVERRIDES.items():
        current = np.asarray(sim.calculate(var, period=year)).astype(object)
        mask = state == st
        current[mask] = [fn(a) for a in age[mask]]
        sim.set_input(var, year, current.astype(str))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--dataset", default=None)
    parser.add_argument("--dataset-path", default=None)
    args = parser.parse_args()

    if args.dataset_path:
        from policyengine_us import Microsimulation

        sim = Microsimulation(dataset=args.dataset_path)
        model_version = importlib.metadata.version("policyengine-us")
        pe_version = None
    else:
        import policyengine as pe

        kwargs = {}
        if args.dataset:
            kwargs["dataset"] = args.dataset
        sim = pe.us.managed_microsimulation(**kwargs)
        model_version = importlib.metadata.version("policyengine-us")
        pe_version = importlib.metadata.version("policyengine")
    year = args.year
    bundle = getattr(sim, "policyengine_bundle", None)

    def measure(sim, mode):
        impute_inputs(sim, year, mode)
        subsidy = sim.calc("child_care_subsidies", period=year)  # SPM unit, weighted MicroSeries
        # Strings cannot be averaged into the SPM unit, so take the state of
        # the unit's first member (all members share a household).
        state_p = np.asarray(sim.calculate("state_code_str", period=year, map_to="person"))
        state = np.asarray(sim.populations["spm_unit"].value_from_first_person(state_p))
        age_p = sim.calc("age", period=year)
        subsidy_p = sim.calc("child_care_subsidies", period=year, map_to="person")
        hours_p = np.asarray(sim.calculate("childcare_hours_per_day", period=year))
        is_child = (age_p < 13) & (hours_p > 0)
        paid = (subsidy > 0)
        unit_in_scope = np.asarray(sim.populations["spm_unit"].any(hours_p > 0))
        out = {}
        for st in sorted(set(state)):
            mask = state == st
            pmask = state_p == st
            out[st] = {
                "eligible_families": float(paid[mask].sum()),
                "annual_subsidy": float(subsidy[mask].sum()),
                "eligible_children": float(((subsidy_p > 0) & is_child)[pmask].sum()),
                "children_in_scope": float(is_child[pmask].sum()),
                "sample_units": int((mask & unit_in_scope).sum()),
            }
        national = {
            "eligible_families": float(paid.sum()),
            "annual_subsidy": float(subsidy.sum()),
            "eligible_children": float(((subsidy_p > 0) & is_child).sum()),
            "children_in_scope": float(is_child.sum()),
        }
        return out, national

    eligible_states, eligible_national = measure(sim, "eligible")
    if args.dataset_path:
        from policyengine_us import Microsimulation

        sim2 = Microsimulation(dataset=args.dataset_path)
    else:
        import policyengine as pe

        sim2 = pe.us.managed_microsimulation(**kwargs)
    paid_states, paid_national = measure(sim2, "paid_care")

    children_under_13 = {}
    age_p = np.asarray(sim.calculate("age", period=year))
    state_p = np.asarray(sim.calculate("state_code_str", period=year, map_to="person"))
    pw = np.asarray(sim.calculate("person_weight", period=year))
    for st in eligible_states:
        children_under_13[st] = float(pw[(state_p == st) & (age_p < 13)].sum())

    states = {}
    for st, e in eligible_states.items():
        p = paid_states.get(st, {})
        states[st] = {
            "eligible_children": e["eligible_children"],
            "eligible_families": e["eligible_families"],
            "potential_annual_subsidy": e["annual_subsidy"],
            "children_under_13": children_under_13[st],
            "eligible_share": e["eligible_children"] / children_under_13[st] if children_under_13[st] else 0.0,
            "paid_care": {
                "eligible_children": p.get("eligible_children", 0.0),
                "eligible_families": p.get("eligible_families", 0.0),
                "annual_subsidy": p.get("annual_subsidy", 0.0),
                "children_in_paid_care": p.get("children_in_scope", 0.0),
                "sample_units": p.get("sample_units", 0),
                "small_sample": p.get("sample_units", 0) < MIN_SAMPLE_UNITS,
            },
        }
    national = {
        "eligible_children": eligible_national["eligible_children"],
        "eligible_families": eligible_national["eligible_families"],
        "potential_annual_subsidy": eligible_national["annual_subsidy"],
        "children_under_13": float(pw[age_p < 13].sum()),
        "paid_care": {
            "eligible_children": paid_national["eligible_children"],
            "eligible_families": paid_national["eligible_families"],
            "annual_subsidy": paid_national["annual_subsidy"],
            "children_in_paid_care": paid_national["children_in_scope"],
        },
    }
    out = {
        "year": year,
        "dataset": args.dataset_path or args.dataset or "certified default",
        "policyengine_version": pe_version,
        "policyengine_us_version": model_version,
        "bundle": str(bundle) if bundle else None,
        "assumed_charge_per_child_month": ASSUMED_CHARGE,
        "min_sample_units": MIN_SAMPLE_UNITS,
        "assumptions": [
            f"Eligible population: every child under 13 is assumed to be in full-time care (8 h/day under 5, 3 h/day at 5-12, 5 days/week, 22 days/month) at ${ASSUMED_CHARGE:,} per child per month, or the family's reported expenses if higher.",
            "Parents meet the activity test when every adult in the family reports at least 20 usual weekly hours of work.",
            "Provider type and quality tier are the model defaults (a licensed center, base tier).",
            "Potential annual subsidy is what the model would pay if every eligible child used care at the assumed charge: an upper bound, not spending.",
            "The paid-care subset restricts to families reporting child care expenses in the CPS; those families skew high-income and small states have few sampled units, so per-state values are noisy.",
            "Counts are children and families the model would pay a positive subsidy, not actual caseloads, which are limited by funding, waitlists and take-up.",
        ],
        "national": national,
        "states": states,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    print(json.dumps(national, indent=1))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
