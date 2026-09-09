"""Precompute the reference-household grid for every state.

For each state and each (adults, child structure) pair, one Simulation with an
axis over the first adult's employment_income produces monthly subsidy, monthly
copay and eligibility at every income step. Output: public/data/{ST}.json and
public/data/metadata.json.

Usage:
    python precompute.py                 # all states
    python precompute.py --states IL,TX  # subset
"""

import argparse
import importlib.metadata
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from policyengine_us import Simulation

from calculator import create_situation, default_hours_per_day
from state_config import (
    ADULTS_RANGE,
    ATTENDING_DAYS_PER_MONTH,
    CHARGE_LEVELS,
    CHILD_STRUCTURES,
    DEFAULT_CHARGE_INDEX,
    DAYS_PER_WEEK,
    INCOME_COUNT,
    INCOME_MAX,
    INCOME_STEP,
    STATES,
    YEAR,
)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")


def monthly_copay(sim, state, num_children, year):
    cfg = STATES[state]
    factor = cfg["copay_factor"]
    var = cfg["copay"]
    entity = sim.tax_benefit_system.variables[var].entity.key
    # copay variables are MONTH-defined; summing over the year and dividing by
    # 12 handles mid-year parameter changes the same way the subsidy does.
    if entity == "person":
        values = sim.calculate(var, year, map_to="spm_unit")
    else:
        values = sim.calculate(var, year)
    values = np.asarray(values) / 12
    if factor == "days":
        return values * ATTENDING_DAYS_PER_MONTH
    return values * factor


CHARGE_COUNT = len(CHARGE_LEVELS)
GRID_SHAPE = (CHARGE_COUNT, INCOME_COUNT)


def compute_structure(state, num_adults, child_ages, year=YEAR):
    """One simulation with two axis groups: income (group 0) and the annual
    provider charge for the SPM unit (group 1). Core lays the cells out with
    group 0 varying fastest, so results reshape to (charge, income)."""
    situation = create_situation(state, num_adults, child_ages, 0, year=year)
    n = len(child_ages)
    situation["axes"] = [
        [
            {
                "name": "employment_income",
                "period": str(year),
                "index": 0,
                "count": INCOME_COUNT,
                "min": 0,
                "max": INCOME_MAX,
            }
        ],
        [
            {
                "name": "spm_unit_pre_subsidy_childcare_expenses",
                "period": str(year),
                "index": 0,
                "count": CHARGE_COUNT,
                "min": CHARGE_LEVELS[0] * 12 * n,
                "max": CHARGE_LEVELS[-1] * 12 * n,
            }
        ],
    ]
    sim = Simulation(situation=situation)
    cfg = STATES[state]
    subsidy = (np.asarray(sim.calculate(cfg["main"], year)) / 12).reshape(GRID_SHAPE)
    copay = monthly_copay(sim, state, n, year).reshape(GRID_SHAPE)
    if cfg["eligible"]:
        eligible = np.asarray(sim.calculate(cfg["eligible"], year)).astype(bool).reshape(GRID_SHAPE)
    else:
        eligible = subsidy > 0
    fpg = float(np.asarray(sim.calculate("spm_unit_fpg", year))[0])
    smi = float(np.asarray(sim.calculate("hhs_smi", year))[0])
    # Sanity check on the axis layout: the charge axis is linear, so the
    # simulation's own expense values must be constant along the income axis.
    charge = np.asarray(sim.calculate("spm_unit_pre_subsidy_childcare_expenses", year)).reshape(GRID_SHAPE)
    assert np.allclose(charge, charge[:, :1]), f"{state}: axis layout mismatch"
    return {
        "subsidy": [[round(float(x), 2) for x in row] for row in subsidy],
        "copay": [[round(float(x), 2) for x in row] for row in copay],
        "eligible": [[bool(x) for x in row] for row in eligible],
        "fpg": fpg,
        "smi": smi,
    }


def compute_state(state, year=YEAR):
    out = {"state": state, "year": year, "structures": {}}
    for num_adults in ADULTS_RANGE:
        for key, ages in CHILD_STRUCTURES.items():
            out["structures"][f"{num_adults}_{key}"] = compute_structure(state, num_adults, ages, year)
    return out


def metadata():
    return {
        "policyengine_us_version": importlib.metadata.version("policyengine-us"),
        "year": YEAR,
        "income_steps": list(range(0, INCOME_MAX + 1, INCOME_STEP)),
        "charge_levels": CHARGE_LEVELS,
        "default_charge_index": DEFAULT_CHARGE_INDEX,
        "adults_range": ADULTS_RANGE,
        "child_structures": {
            k: {
                "ages": v,
                "hours_per_day": [default_hours_per_day(a) for a in v],
            }
            for k, v in CHILD_STRUCTURES.items()
        },
        "assumptions": {
            "monthly_charge_per_child": CHARGE_LEVELS[DEFAULT_CHARGE_INDEX],
            "days_per_week": DAYS_PER_WEEK,
            "attending_days_per_month": ATTENDING_DAYS_PER_MONTH,
            "weekly_hours_worked": 40,
            "provider": "state default provider type (a licensed center) at the base quality tier",
        },
        "states": [
            {
                "code": c,
                "name": s["name"],
                "program": s["program"],
                "county": s["county"],
            }
            for c, s in sorted(STATES.items())
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--states", default=None)
    args = parser.parse_args()
    states = args.states.split(",") if args.states else sorted(STATES)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for state in states:
        t0 = time.time()
        data = compute_state(state)
        with open(os.path.join(OUTPUT_DIR, f"{state}.json"), "w") as f:
            json.dump(data, f, separators=(",", ":"))
        s = data["structures"]["1_two"]
        sub = s["subsidy"][DEFAULT_CHARGE_INDEX]
        cop = s["copay"][DEFAULT_CHARGE_INDEX]
        cutoff = next((i for i, v in enumerate(sub) if v == 0 and i > 0), None)
        print(
            f"{state}: {time.time() - t0:.1f}s  1 adult + 2 kids @ $1,500/child: "
            f"subsidy@$30k=${sub[30]:,.0f}/mo copay=${cop[30]:,.0f}  "
            f"@$60k=${sub[60]:,.0f}  first $0 income={cutoff}k",
            flush=True,
        )
    with open(os.path.join(OUTPUT_DIR, "metadata.json"), "w") as f:
        json.dump(metadata(), f, indent=1)


if __name__ == "__main__":
    main()
