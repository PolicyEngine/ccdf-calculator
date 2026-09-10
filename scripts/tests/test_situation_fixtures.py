"""The committed cross-language fixture must match the Python builder."""

import json
import os

import situation_fixtures


def test_fixture_file_is_current():
    path = os.path.abspath(situation_fixtures.FIXTURE_PATH)
    assert os.path.exists(path), (
        "missing src/lib/__fixtures__/situations.json; run "
        "`python scripts/tests/situation_fixtures.py --write`"
    )
    with open(path, encoding="utf-8") as handle:
        committed = json.load(handle)
    # JSON turns the integer year keys into strings; normalise the same way.
    current = json.loads(json.dumps(situation_fixtures.build()))
    assert committed == current, (
        "situations.json is stale; run `python scripts/tests/situation_fixtures.py --write`"
    )


def test_cases_have_unique_ids_and_known_states():
    from state_config import STATES

    ids = [case["id"] for case in situation_fixtures.CASES]
    assert len(ids) == len(set(ids))
    assert all(case["state"] in STATES for case in situation_fixtures.CASES)
