"""Actual-model period regressions; skipped in the lightweight data-only CI job."""
import pytest
pytest.importorskip("policyengine_us")
from policyengine_us import Simulation
from calculator import create_situation
from precompute import monthly_copay
from state_config import REFERENCE_MONTH


def test_nc_integer_monthly_fee_is_not_divided_by_twelve():
    sim = Simulation(situation=create_situation("NC", 1, [3, 7], 30000))
    assert monthly_copay(sim, "NC", REFERENCE_MONTH)[0] == 250


@pytest.mark.parametrize("state,ages,variable,expected", [
    ("SD", [3, 7], "sd_cca", 1283.75),
    ("IN", [3], "in_ccdf", 0),
])
def test_reference_month_avoids_annual_averaging(state, ages, variable, expected):
    sim = Simulation(situation=create_situation(state, 1, ages, 30000))
    assert sim.calculate(variable, REFERENCE_MONTH)[0] == pytest.approx(expected)
    assert sim.calculate(variable, 2026)[0] / 12 != pytest.approx(expected)
