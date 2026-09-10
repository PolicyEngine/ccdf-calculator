"""The per-state contract in state_config.py must be complete and consistent."""

import pytest

import state_config as cfg
from calculator import default_hours_per_day, output_variables

CODES = sorted(cfg.STATES)


def test_covers_all_fifty_states_and_dc():
    assert len(CODES) == 51
    assert "DC" in CODES
    assert set(cfg.STATE_NAMES) == set(CODES)
    assert set(cfg.PROGRAM_NAMES) == set(CODES)


@pytest.mark.parametrize("code", CODES)
def test_state_entry_is_well_formed(code):
    state = cfg.STATES[code]
    assert state["code"] == code
    assert state["name"] == cfg.STATE_NAMES[code]
    assert state["program"] == cfg.PROGRAM_NAMES[code]
    assert isinstance(state["main"], str) and state["main"]
    assert isinstance(state["copay"], str) and state["copay"]
    assert state["main"] != state["copay"]
    assert state["eligible"] is None or (isinstance(state["eligible"], str) and state["eligible"])
    factor = state["copay_factor"]
    assert factor == "days" or (isinstance(factor, (int, float)) and factor > 0)


@pytest.mark.parametrize("code", CODES)
def test_reference_county_belongs_to_the_state(code):
    county = cfg.STATES[code]["county"]
    assert county is None or county.endswith(f"_{code}"), county


@pytest.mark.parametrize("code", CODES)
def test_copay_factor_matches_the_unit_in_the_variable_name(code):
    """A weekly variable must be scaled by weeks, a daily one by days, and a
    plain monthly one by nothing. This is the single most error-prone line
    per state, so the name is used as an independent check on the factor."""
    state = cfg.STATES[code]
    name = state["copay"]
    factor = state["copay_factor"]
    if "weekly" in name:
        assert factor == cfg.WEEKS_PER_MONTH, f"{code}: weekly copay needs WEEKS_PER_MONTH"
    elif "daily" in name:
        assert factor == "days", f"{code}: daily copay needs the 'days' factor"
    elif factor == 1:
        assert "week" not in name and "dai" not in name, f"{code}: unit in name but factor 1"


def test_known_non_monthly_copays_are_the_documented_ones():
    non_monthly = {code for code, s in cfg.STATES.items() if s["copay_factor"] != 1}
    assert non_monthly == {"AL", "AR", "LA", "MD", "MI", "NH"}
    assert cfg.STATES["MI"]["copay_factor"] == cfg.PAY_PERIODS_PER_MONTH
    assert cfg.STATES["NH"]["copay_factor"] == cfg.WEEKS_PER_MONTH


def test_states_without_an_eligibility_flag_are_the_documented_ones():
    assert {code for code, s in cfg.STATES.items() if s["eligible"] is None} == {"CA", "NY"}


def test_person_overrides_target_known_states():
    assert set(cfg.PERSON_OVERRIDES) <= set(cfg.STATES)
    assert cfg.PERSON_OVERRIDES["MD"]["md_ccs_provider_type"] == "LICENSED_CENTER"
    split = cfg.PERSON_OVERRIDES["MA"]["ma_ccfa_care_provider_type"]
    assert split(4) == "CENTER_BASED_CARE_EARLY_EDUCATION"
    assert split(5) == "CENTER_BASED_CARE_SCHOOL_AGE"


def test_reference_grid_settings():
    for key, ages in cfg.CHILD_STRUCTURES.items():
        assert ages == sorted(ages), key
        assert all(0 <= age < 13 for age in ages), key
    assert cfg.ADULTS_RANGE == [1, 2]
    assert cfg.CHARGE_LEVELS == sorted(cfg.CHARGE_LEVELS)
    assert 0 <= cfg.DEFAULT_CHARGE_INDEX < len(cfg.CHARGE_LEVELS)
    assert cfg.ASSUMED_MONTHLY_CHARGE_PER_CHILD == cfg.CHARGE_LEVELS[cfg.DEFAULT_CHARGE_INDEX]
    assert cfg.INCOME_COUNT == cfg.INCOME_MAX // cfg.INCOME_STEP + 1 == 201
    assert cfg.SCHOOL_AGE_CUTOFF == 5


def test_default_hours_by_age():
    assert default_hours_per_day(0) == cfg.FULL_TIME_HOURS_PER_DAY
    assert default_hours_per_day(4) == cfg.FULL_TIME_HOURS_PER_DAY
    assert default_hours_per_day(5) == cfg.SCHOOL_AGE_HOURS_PER_DAY
    assert default_hours_per_day(12) == cfg.SCHOOL_AGE_HOURS_PER_DAY


def test_output_variables_include_eligibility_only_when_defined():
    assert output_variables("MD") == [
        "child_care_subsidies", "md_ccs", "md_ccs_weekly_copay",
        "spm_unit_fpg", "hhs_smi", "md_ccs_eligible",
    ]
    assert output_variables("CA")[-1] == "hhs_smi"
