"""create_situation() is the single description of a household; pin its shape."""

from calculator import create_situation
from state_config import ASSUMED_MONTHLY_CHARGE_PER_CHILD, YEAR


def test_adults_and_entities():
    sit = create_situation("MD", 2, [3, 7], earned_income=30000)
    assert sit["people"]["adult_1"]["employment_income"] == {YEAR: 30000}
    assert sit["people"]["adult_2"]["employment_income"] == {YEAR: 0}
    assert sit["people"]["adult_2"]["weekly_hours_worked_before_lsr"] == {YEAR: 40}
    members = ["adult_1", "adult_2", "child_1", "child_2"]
    assert sit["spm_units"]["spm_unit"]["members"] == members
    assert sit["tax_units"]["tax_unit"]["members"] == members
    assert sit["families"]["family"]["members"] == members
    assert sit["marital_units"]["marital_unit"]["members"] == ["adult_1", "adult_2"]


def test_children_get_default_hours_by_age_and_the_schedule():
    sit = create_situation("MD", 1, [3, 7])
    assert sit["people"]["child_1"]["childcare_hours_per_day"] == {YEAR: 8}
    assert sit["people"]["child_2"]["childcare_hours_per_day"] == {YEAR: 3}
    assert sit["people"]["child_2"]["childcare_days_per_week"] == {YEAR: 5}
    assert sit["people"]["child_2"]["childcare_attending_days_per_month"] == {YEAR: 22}


def test_explicit_hours_and_schedule_are_used():
    sit = create_situation(
        "MD", 1, [3], hours_per_day=[6], days_per_week=4, attending_days_per_month=18
    )
    child = sit["people"]["child_1"]
    assert child["childcare_hours_per_day"] == {YEAR: 6}
    assert child["childcare_days_per_week"] == {YEAR: 4}
    assert child["childcare_attending_days_per_month"] == {YEAR: 18}


def test_provider_charge_is_annualised_over_children():
    sit = create_situation("MD", 1, [1, 3, 7], monthly_charge_per_child=2000)
    assert sit["spm_units"]["spm_unit"]["spm_unit_pre_subsidy_childcare_expenses"] == {
        YEAR: 2000 * 12 * 3
    }
    default = create_situation("MD", 1, [3])
    assert default["spm_units"]["spm_unit"]["spm_unit_pre_subsidy_childcare_expenses"] == {
        YEAR: ASSUMED_MONTHLY_CHARGE_PER_CHILD * 12
    }


def test_activity_test_flag():
    assert create_situation("NV", 1, [3])["spm_units"]["spm_unit"]["meets_ccdf_activity_test"] == {
        YEAR: True
    }
    assert create_situation("NV", 1, [3], in_activity=False)["spm_units"]["spm_unit"][
        "meets_ccdf_activity_test"
    ] == {YEAR: False}


def test_maryland_provider_type_override_and_user_value_wins():
    sit = create_situation("MD", 1, [3, 7])
    for child in ("child_1", "child_2"):
        assert sit["people"][child]["md_ccs_provider_type"] == {YEAR: "LICENSED_CENTER"}
    custom = create_situation("MD", 1, [3], person_inputs={"md_ccs_provider_type": "INFORMAL"})
    assert custom["people"]["child_1"]["md_ccs_provider_type"] == {YEAR: "INFORMAL"}


def test_massachusetts_provider_type_splits_by_age():
    sit = create_situation("MA", 1, [2, 9])
    assert sit["people"]["child_1"]["ma_ccfa_care_provider_type"] == {
        YEAR: "CENTER_BASED_CARE_EARLY_EDUCATION"
    }
    assert sit["people"]["child_2"]["ma_ccfa_care_provider_type"] == {
        YEAR: "CENTER_BASED_CARE_SCHOOL_AGE"
    }


def test_other_states_get_no_override():
    sit = create_situation("CA", 1, [3])
    assert "md_ccs_provider_type" not in sit["people"]["child_1"]
    assert "ma_ccfa_care_provider_type" not in sit["people"]["child_1"]


def test_spm_inputs_and_location():
    sit = create_situation("MD", 1, [3], spm_inputs={"md_ccs_enrolled": True})
    assert sit["spm_units"]["spm_unit"]["md_ccs_enrolled"] == {YEAR: True}
    household = sit["households"]["household"]
    assert household["state_code"] == {YEAR: "MD"}
    assert household["county"] == {YEAR: "MONTGOMERY_COUNTY_MD"}
    custom = create_situation("MD", 1, [3], county="BALTIMORE_CITY_MD")
    assert custom["households"]["household"]["county"] == {YEAR: "BALTIMORE_CITY_MD"}
