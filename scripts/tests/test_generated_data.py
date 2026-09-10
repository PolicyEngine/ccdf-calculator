"""The committed files in public/data/ must satisfy docs/DATA_CONTRACT.md.

These checks catch the failure modes seen while building the grid: a state
that pays nothing everywhere (Maryland's default provider type, Nevada
without the activity flag), a copay unit converted twice, a state file that
drifted from state_config.py, or a policy-index cutoff that no longer matches
the grid it was derived from.
"""

import math
import re

import pytest

import state_config as cfg

CODES = sorted(cfg.STATES)
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")

# Model behaviours that violate the generic invariants below. Each entry is a
# known, reviewed exception; a new state appearing in a failure means the
# model or the pipeline changed and needs a look, not a longer allowlist.
#
# Vermont pays its full rate even when the provider charges less, so the
# subsidy can exceed charge x children in the grid (policyengine-us 1.824.7).
KNOWN_PAYS_ABOVE_CHARGE = {"VT"}
# Indiana pays a subsidy at some incomes where `in_ccdf_eligible` is False
# (policyengine-us 1.824.7): the payment and the flag use different limits.
KNOWN_ELIGIBILITY_GAP = {"IN"}


def structure_keys(metadata):
    return {
        f"{adults}_{child}"
        for adults in metadata["adults_range"]
        for child in metadata["child_structures"]
    }


# --------------------------------------------------------------------- metadata


def test_metadata_matches_state_config(metadata):
    assert SEMVER.match(metadata["policyengine_us_version"])
    assert metadata["year"] == cfg.YEAR
    steps = metadata["income_steps"]
    assert steps == list(range(0, cfg.INCOME_MAX + 1, cfg.INCOME_STEP))
    assert metadata["charge_levels"] == cfg.CHARGE_LEVELS
    assert metadata["default_charge_index"] == cfg.DEFAULT_CHARGE_INDEX
    assert metadata["adults_range"] == cfg.ADULTS_RANGE
    assert {k: v["ages"] for k, v in metadata["child_structures"].items()} == cfg.CHILD_STRUCTURES
    for structure in metadata["child_structures"].values():
        assert structure["hours_per_day"] == [
            cfg.FULL_TIME_HOURS_PER_DAY if age < cfg.SCHOOL_AGE_CUTOFF else cfg.SCHOOL_AGE_HOURS_PER_DAY
            for age in structure["ages"]
        ]
    assumptions = metadata["assumptions"]
    assert assumptions["monthly_charge_per_child"] == cfg.ASSUMED_MONTHLY_CHARGE_PER_CHILD
    assert assumptions["days_per_week"] == cfg.DAYS_PER_WEEK
    assert assumptions["attending_days_per_month"] == cfg.ATTENDING_DAYS_PER_MONTH


def test_metadata_lists_every_state_once_in_order(metadata):
    codes = [state["code"] for state in metadata["states"]]
    assert codes == CODES
    for state in metadata["states"]:
        expected = cfg.STATES[state["code"]]
        assert state["name"] == expected["name"]
        assert state["program"] == expected["program"]
        assert state["county"] == expected["county"]


# ------------------------------------------------------------------ state files


@pytest.mark.parametrize("code", CODES)
def test_state_file_shape(code, metadata, state_files):
    data = state_files[code]
    assert data["state"] == code
    assert data["year"] == metadata["year"]
    assert set(data["structures"]) == structure_keys(metadata)
    n_charges = len(metadata["charge_levels"])
    n_incomes = len(metadata["income_steps"])
    for key, grid in data["structures"].items():
        for field in ("subsidy", "copay", "eligible"):
            rows = grid[field]
            assert len(rows) == n_charges, (code, key, field)
            assert all(len(row) == n_incomes for row in rows), (code, key, field)
        assert all(isinstance(flag, bool) for row in grid["eligible"] for flag in row), (code, key)
        for field in ("subsidy", "copay"):
            for row in grid[field]:
                assert all(math.isfinite(v) and v >= 0 for v in row), (code, key, field)
        assert grid["fpg"] > 0 and grid["smi"] > 0, (code, key)
        assert grid["smi"] > grid["fpg"], (code, key)


@pytest.mark.parametrize("code", CODES)
def test_state_pays_something_somewhere(code, state_files):
    """A state whose grid is all zeros is a configuration bug, not a policy."""
    data = state_files[code]
    assert any(
        value > 0
        for grid in data["structures"].values()
        for row in grid["subsidy"]
        for value in row
    ), f"{code} pays nothing at any income for any reference household"


@pytest.mark.parametrize("code", CODES)
def test_subsidy_never_exceeds_the_total_charge(code, metadata, state_files):
    if code in KNOWN_PAYS_ABOVE_CHARGE:
        pytest.skip("reviewed exception; see KNOWN_PAYS_ABOVE_CHARGE")
    data = state_files[code]
    for key, grid in data["structures"].items():
        children = len(metadata["child_structures"][key.split("_", 1)[1]]["ages"])
        for level, row in zip(metadata["charge_levels"], grid["subsidy"]):
            cap = level * children + 0.01
            assert max(row) <= cap, f"{code} {key} at ${level}: {max(row)} > {cap}"


@pytest.mark.parametrize("code", CODES)
def test_positive_subsidy_implies_eligible_flag(code, metadata, state_files):
    if code in KNOWN_ELIGIBILITY_GAP:
        pytest.skip("reviewed exception; see KNOWN_ELIGIBILITY_GAP")
    data = state_files[code]
    for key, grid in data["structures"].items():
        for ci in range(len(metadata["charge_levels"])):
            for income, paid, eligible in zip(
                metadata["income_steps"], grid["subsidy"][ci], grid["eligible"][ci]
            ):
                assert not (paid > 0 and not eligible), (
                    f"{code} {key} charge index {ci} income {income}: pays {paid} but not eligible"
                )


def test_known_exceptions_still_hold(metadata, state_files):
    """When the model fixes these, drop them from the allowlist."""
    vt = state_files["VT"]["structures"]["1_infant"]
    assert max(vt["subsidy"][0]) > metadata["charge_levels"][0], (
        "Vermont no longer pays above the charge; remove it from KNOWN_PAYS_ABOVE_CHARGE"
    )
    indiana = state_files["IN"]["structures"]
    assert any(
        paid > 0 and not eligible
        for grid in indiana.values()
        for paid_row, elig_row in zip(grid["subsidy"], grid["eligible"])
        for paid, eligible in zip(paid_row, elig_row)
    ), "Indiana's flag now matches its payment; remove it from KNOWN_ELIGIBILITY_GAP"


def test_two_adults_do_not_change_fpg_by_less_than_one_person(state_files):
    """Adding an adult raises the poverty guideline for the unit."""
    for code, data in state_files.items():
        one = data["structures"]["1_two"]["fpg"]
        two = data["structures"]["2_two"]["fpg"]
        assert two > one, code


# --------------------------------------------------------------- state_inputs


def test_state_inputs_cover_every_state(state_inputs, metadata):
    assert state_inputs["year"] == metadata["year"]
    assert sorted(state_inputs["states"]) == CODES


@pytest.mark.parametrize("code", CODES)
def test_state_inputs_match_state_config(code, state_inputs):
    entry = state_inputs["states"][code]
    expected = cfg.STATES[code]
    for field in ("code", "name", "program", "main", "copay", "eligible", "county"):
        assert entry[field] == expected[field], field
    assert entry["copay_factor"] == expected["copay_factor"]
    assert entry["copay_entity"] in ("spm_unit", "person")
    outputs = entry["outputs"]
    for required in ("child_care_subsidies", "spm_unit_fpg", "hhs_smi", expected["main"], expected["copay"]):
        assert required in outputs, (code, required)
    if expected["eligible"]:
        assert expected["eligible"] in outputs
    assert len(outputs) == len(set(outputs))


@pytest.mark.parametrize("code", CODES)
def test_state_inputs_are_well_formed(code, state_inputs):
    names = set()
    for item in state_inputs["states"][code]["inputs"]:
        assert item["name"] not in names, (code, item["name"])
        names.add(item["name"])
        assert item["entity"] in ("person", "spm_unit"), (code, item["name"])
        assert item["type"] in ("enum", "bool", "number"), (code, item["name"])
        assert item["label"], (code, item["name"])
        if item["type"] == "enum":
            values = [option["value"] for option in item["options"]]
            assert item["default"] in values, (code, item["name"])
            assert all(option["label"] for option in item["options"]), (code, item["name"])
        elif item["type"] == "bool":
            assert isinstance(item["default"], bool), (code, item["name"])
        else:
            assert isinstance(item["default"], (int, float)), (code, item["name"])


def test_person_level_copay_states(state_inputs):
    person = {code for code, s in state_inputs["states"].items() if s["copay_entity"] == "person"}
    assert person == {"AR"}


def test_maryland_exposes_the_provider_type_the_override_depends_on(state_inputs):
    names = {item["name"] for item in state_inputs["states"]["MD"]["inputs"]}
    assert "md_ccs_provider_type" in names


# --------------------------------------------------------------- policy_index


def test_policy_index_covers_every_state(policy_index, metadata):
    assert policy_index["year"] == metadata["year"]
    assert sorted(policy_index["states"]) == CODES


@pytest.mark.parametrize("code", CODES)
def test_policy_index_entry(code, policy_index, metadata):
    entry = policy_index["states"][code]
    assert entry["code"] == code
    assert entry["parameter_root"].startswith("gov.")
    assert set(entry["thresholds"]) == structure_keys(metadata)
    for key, threshold in entry["thresholds"].items():
        if threshold is None:
            continue
        assert 0 <= threshold["income"] <= cfg.INCOME_MAX, (code, key)
        assert threshold["fpg_ratio"] > 0 and threshold["smi_ratio"] > 0, (code, key)
        assert threshold["max_subsidy"] >= threshold["subsidy_at_zero_income"] >= 0, (code, key)
    for parameter in entry["parameters"]:
        assert parameter["path"].startswith("gov."), (code, parameter["path"])
        assert parameter["label"], (code, parameter["path"])


@pytest.mark.parametrize("code", CODES)
def test_policy_index_cutoffs_agree_with_the_grid(code, policy_index, metadata, state_files):
    """The cutoff is derived from the grid at the default charge level."""
    default = metadata["default_charge_index"]
    steps = metadata["income_steps"]
    for key, grid in state_files[code]["structures"].items():
        row = grid["subsidy"][default]
        paid = [income for income, value in zip(steps, row) if value > 0]
        threshold = policy_index["states"][code]["thresholds"][key]
        if not paid:
            assert threshold is None, (code, key)
            continue
        assert threshold is not None, (code, key)
        assert threshold["income"] == max(paid), (code, key)
        assert threshold["max_subsidy"] == pytest.approx(max(row), abs=0.01), (code, key)
        assert threshold["subsidy_at_zero_income"] == pytest.approx(row[0], abs=0.01), (code, key)


# --------------------------------------------------------------------- impact


def test_impact_headline_is_internally_consistent(impact, metadata):
    assert impact["year"] == metadata["year"]
    assert impact["policyengine_us_version"] == metadata["policyengine_us_version"], (
        "impact.json was generated with a different model version than the grid"
    )
    assert impact["assumed_charge_per_child_month"] == cfg.ASSUMED_MONTHLY_CHARGE_PER_CHILD
    assert sorted(impact["states"]) == CODES
    national = impact["national"]
    for field in ("eligible_children", "eligible_families", "potential_annual_subsidy", "children_under_13"):
        total = sum(state[field] for state in impact["states"].values())
        assert national[field] == pytest.approx(total, rel=0.005), field
    assert national["eligible_children"] <= national["children_under_13"]


@pytest.mark.parametrize("code", CODES)
def test_impact_state_row(code, impact):
    row = impact["states"][code]
    assert 0 <= row["eligible_children"] <= row["children_under_13"]
    assert 0 <= row["eligible_families"] <= row["eligible_children"] + 1e-6
    assert row["potential_annual_subsidy"] >= 0
    assert row["eligible_share"] == pytest.approx(
        row["eligible_children"] / row["children_under_13"], rel=1e-6
    )
    paid = row["paid_care"]
    assert paid["eligible_children"] <= row["eligible_children"] + 1e-6
    assert paid["annual_subsidy"] <= row["potential_annual_subsidy"] + 1e-6
    assert paid["small_sample"] == (paid["sample_units"] < impact["min_sample_units"])
