"""Build PolicyEngine situations for child care subsidy calculations.

`create_situation` is the single source of truth for how a household is
described to the model. The frontend's live-API path (src/lib/situation.ts)
mirrors it field for field; keep the two in sync.
"""

from __future__ import annotations

from state_config import (
    ASSUMED_MONTHLY_CHARGE_PER_CHILD,
    ATTENDING_DAYS_PER_MONTH,
    DAYS_PER_WEEK,
    FULL_TIME_HOURS_PER_DAY,
    PERSON_OVERRIDES,
    SCHOOL_AGE_CUTOFF,
    SCHOOL_AGE_HOURS_PER_DAY,
    STATES,
    YEAR,
)

MONTHS = [f"{YEAR}-{m:02d}" for m in range(1, 13)]


def default_hours_per_day(age: int) -> float:
    return FULL_TIME_HOURS_PER_DAY if age < SCHOOL_AGE_CUTOFF else SCHOOL_AGE_HOURS_PER_DAY


def create_situation(
    state: str,
    num_adults: int,
    child_ages: list[int],
    earned_income: float = 0,
    year: int = YEAR,
    monthly_charge_per_child: float | None = None,
    hours_per_day: list[float] | None = None,
    days_per_week: float = DAYS_PER_WEEK,
    attending_days_per_month: int = ATTENDING_DAYS_PER_MONTH,
    weekly_hours_worked: float = 40,
    in_activity: bool = True,
    county: str | None = None,
    person_inputs: dict | None = None,
    spm_inputs: dict | None = None,
) -> dict:
    """Return a policyengine-us situation dict.

    Args:
        state: two-letter code.
        num_adults: 1 or 2. Earned income goes to the first adult; both work
            `weekly_hours_worked` hours.
        child_ages: ages of the children in paid care.
        earned_income: annual employment income of the first adult.
        monthly_charge_per_child: what the provider charges per child per
            month. Defaults to the reference-grid assumption.
        hours_per_day: per-child care hours per day; defaults by age.
        in_activity: parents meet the CCDF work/education activity test.
        county: county enum name; defaults to the state's largest county.
        person_inputs: extra per-child inputs {var: value or callable(age)},
            e.g. provider type enums. Merged over PERSON_OVERRIDES.
        spm_inputs: extra SPM-unit inputs {var: value}.
    """
    cfg = STATES[state]
    if monthly_charge_per_child is None:
        monthly_charge_per_child = ASSUMED_MONTHLY_CHARGE_PER_CHILD
    if hours_per_day is None:
        hours_per_day = [default_hours_per_day(a) for a in child_ages]
    if county is None:
        county = cfg["county"]

    people: dict = {}
    members: list[str] = []
    for i in range(num_adults):
        pid = f"adult_{i + 1}"
        people[pid] = {
            "age": {year: 35},
            "weekly_hours_worked_before_lsr": {year: weekly_hours_worked},
            "employment_income": {year: earned_income if i == 0 else 0},
        }
        members.append(pid)

    overrides = dict(PERSON_OVERRIDES.get(state, {}))
    overrides.update(person_inputs or {})
    for i, age in enumerate(child_ages):
        pid = f"child_{i + 1}"
        person = {
            "age": {year: age},
            "childcare_hours_per_day": {year: hours_per_day[i]},
            "childcare_days_per_week": {year: days_per_week},
            "childcare_attending_days_per_month": {year: attending_days_per_month},
        }
        for var, value in overrides.items():
            person[var] = {year: value(age) if callable(value) else value}
        people[pid] = person
        members.append(pid)

    spm_unit = {
        "members": members,
        "spm_unit_pre_subsidy_childcare_expenses": {
            year: monthly_charge_per_child * 12 * len(child_ages)
        },
        "meets_ccdf_activity_test": {year: in_activity},
    }
    spm_unit.update({k: {year: v} for k, v in (spm_inputs or {}).items()})

    adults = members[:num_adults]
    household = {"members": members, "state_code": {year: state}}
    if county:
        household["county"] = {year: county}

    return {
        "people": people,
        "families": {"family": {"members": members}},
        "marital_units": {"marital_unit": {"members": adults}},
        "tax_units": {"tax_unit": {"members": members}},
        "spm_units": {"spm_unit": spm_unit},
        "households": {"household": household},
    }


def output_variables(state: str) -> list[str]:
    cfg = STATES[state]
    out = ["child_care_subsidies", cfg["main"], cfg["copay"], "spm_unit_fpg", "hhs_smi"]
    if cfg["eligible"]:
        out.append(cfg["eligible"])
    return out
