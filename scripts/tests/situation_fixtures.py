"""Household cases shared by the Python and TypeScript situation builders.

`scripts/calculator.py::create_situation` and `src/lib/situation.ts::buildSituation`
must describe the same household identically. This module writes the Python
output for a handful of cases to `src/lib/__fixtures__/situations.json`;
`test_situation_fixtures.py` checks the file is current and
`src/lib/situation.parity.test.ts` checks the TypeScript builder reproduces it.

Regenerate after changing either builder or a case:

    python scripts/tests/situation_fixtures.py --write
"""

import argparse
import json
import os
import sys

SCRIPTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

from calculator import create_situation  # noqa: E402
from state_config import YEAR  # noqa: E402

FIXTURE_PATH = os.path.join(
    SCRIPTS_DIR, "..", "src", "lib", "__fixtures__", "situations.json"
)

CASES = [
    {
        "id": "md_one_adult_two_children",
        "state": "MD", "num_adults": 1, "child_ages": [3, 7], "earned_income": 30000,
    },
    {
        "id": "ar_two_adults_infant_custom_schedule",
        "state": "AR", "num_adults": 2, "child_ages": [1], "earned_income": 50000,
        "monthly_charge_per_child": 2000, "hours_per_day": [6],
        "days_per_week": 4, "attending_days_per_month": 18,
    },
    {
        "id": "ma_provider_type_split_by_age",
        "state": "MA", "num_adults": 1, "child_ages": [2, 9], "earned_income": 45000,
    },
    {
        "id": "ca_not_in_activity",
        "state": "CA", "num_adults": 1, "child_ages": [4], "earned_income": 20000,
        "in_activity": False,
    },
    {
        "id": "md_user_inputs_win",
        "state": "MD", "num_adults": 1, "child_ages": [3], "earned_income": 30000,
        "person_inputs": {"md_ccs_provider_type": "INFORMAL"},
        "spm_inputs": {"md_ccs_enrolled": True},
    },
    {
        "id": "three_children_high_income",
        "state": "TX", "num_adults": 2, "child_ages": [1, 3, 7], "earned_income": 120000,
        "monthly_charge_per_child": 3000,
    },
]


def build():
    cases = []
    for case in CASES:
        inputs = {key: value for key, value in case.items() if key != "id"}
        cases.append({
            "id": case["id"],
            "inputs": inputs,
            "situation": create_situation(**inputs),
        })
    return {"year": YEAR, "cases": cases}


def write():
    path = os.path.abspath(FIXTURE_PATH)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(build(), handle, indent=2)
        handle.write("\n")
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="write the fixture file")
    args = parser.parse_args()
    if args.write:
        print(f"wrote {write()}")
    else:
        print(json.dumps(build(), indent=2))
