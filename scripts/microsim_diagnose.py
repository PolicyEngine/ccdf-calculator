"""Diagnose why a state pays (almost) nothing in the microsim.

Loads the dataset the same way microsim.py does, applies the same
imputation, then for each requested state prints weighted counts along the
eligibility chain and the county distribution.

Usage: python microsim_diagnose.py --dataset-path ../data/x.h5 --states NV,IA
"""

import argparse
import collections
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from microsim import impute_inputs  # noqa: E402
from state_config import STATES  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-path", required=True)
    parser.add_argument("--states", default="NV,IA,NE,ND,MT,RI,HI,SD")
    parser.add_argument("--year", type=int, default=2026)
    args = parser.parse_args()
    from policyengine_us import Microsimulation

    sim = Microsimulation(dataset=args.dataset_path)
    year = args.year
    impute_inputs(sim, year)

    P = sim.populations
    state_p = np.asarray(sim.calculate("state_code_str", period=year, map_to="person"))
    state_s = np.asarray(P["spm_unit"].value_from_first_person(state_p))
    w = np.asarray(sim.calculate("spm_unit_weight", period=year))
    age = np.asarray(sim.calculate("age", period=year))
    hours = np.asarray(sim.calculate("childcare_hours_per_day", period=year))
    in_care_unit = np.asarray(P["spm_unit"].any((age < 13) & (hours > 0)))
    activity = np.asarray(sim.calculate("meets_ccdf_activity_test", period=year))
    expenses = np.asarray(sim.calculate("spm_unit_pre_subsidy_childcare_expenses", period=year))
    county_p = np.asarray(sim.calculate("county_str", period=year, map_to="person"))
    county_s = np.asarray(P["spm_unit"].value_from_first_person(county_p))
    subsidy = np.asarray(sim.calculate("child_care_subsidies", period=year))

    for st in args.states.split(","):
        cfg = STATES[st]
        m = state_s == st
        print(f"\n===== {st} ({cfg['program']}) =====")
        print(f"units: {w[m].sum():,.0f}  with paid care: {w[m & in_care_unit].sum():,.0f}  "
              f"of which activity test: {w[m & in_care_unit & activity].sum():,.0f}")
        print(f"mean annual expenses among paid-care units: {np.average(expenses[m & in_care_unit], weights=w[m & in_care_unit]) if (m & in_care_unit).any() else 0:,.0f}")
        if cfg["eligible"]:
            elig = np.asarray(sim.calculate(cfg["eligible"], period=year))
            print(f"{cfg['eligible']}: {w[m & elig].sum():,.0f}")
        main_v = np.asarray(sim.calculate(cfg["main"], period=year))
        copay = np.asarray(sim.calculate(cfg["copay"], period=year))
        print(f"{cfg['main']} > 0: {w[m & (main_v > 0)].sum():,.0f}   subsidy>0: {w[m & (subsidy > 0)].sum():,.0f}")
        sel = m & in_care_unit & activity
        if sel.any():
            print(f"among paid-care+activity units: mean {cfg['main']}={np.average(main_v[sel], weights=w[sel]):,.0f} "
                  f"mean copay={np.average(copay[sel], weights=w[sel]):,.0f}")
        counties = collections.Counter()
        for c, ww in zip(county_s[m], w[m]):
            counties[c] += ww
        print("top counties:", [(c, round(v)) for c, v in counties.most_common(3)])
        # Person-level chain for eligible child flags, if present
        for cand in (f"{cfg['main']}_eligible_child", f"is_{cfg['main']}_child_eligible"):
            if cand in sim.tax_benefit_system.variables:
                ec = np.asarray(sim.calculate(cand, period=year))
                pw = np.asarray(sim.calculate("person_weight", period=year))
                pm = state_p == st
                print(f"{cand}: {pw[pm & ec].sum():,.0f} children (in care: {pw[pm & (hours > 0)].sum():,.0f})")


if __name__ == "__main__":
    main()
