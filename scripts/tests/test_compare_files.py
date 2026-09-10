"""public/data/compare/*.json must be an exact re-slicing of the state files."""

import json
import os

import pytest

import build_compare
from conftest import DATA_DIR

COMPARE_DIR = os.path.join(DATA_DIR, "compare")


def expected_names(metadata):
    return {
        f"{adults}_{child}_{ci}"
        for adults in metadata["adults_range"]
        for child in metadata["child_structures"]
        for ci in range(len(metadata["charge_levels"]))
    }


def test_one_file_per_structure_and_charge_level(metadata):
    names = {name[:-5] for name in os.listdir(COMPARE_DIR) if name.endswith(".json")}
    assert names == expected_names(metadata)


@pytest.mark.parametrize("charge_index", range(5))
def test_compare_files_match_the_state_grid(charge_index, metadata, state_files):
    expected = build_compare.build(metadata, state_files)
    for key in (k for k in expected if k.endswith(f"_{charge_index}")):
        with open(os.path.join(COMPARE_DIR, f"{key}.json"), encoding="utf-8") as handle:
            committed = json.load(handle)
        assert committed == expected[key], (
            f"compare/{key}.json is stale; run `python scripts/build_compare.py`"
        )


def test_every_state_in_every_cell(metadata):
    codes = {state["code"] for state in metadata["states"]}
    with open(os.path.join(COMPARE_DIR, "1_two_1.json"), encoding="utf-8") as handle:
        cell = json.load(handle)
    assert set(cell["states"]) == codes
    assert cell["income_steps"] == metadata["income_steps"]
    assert cell["charge_level"] == metadata["charge_levels"][1]
    assert cell["policyengine_us_version"] == metadata["policyengine_us_version"]
