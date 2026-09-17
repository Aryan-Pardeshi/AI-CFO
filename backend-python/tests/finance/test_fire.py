"""Tests for finance/fire.py — locked regression fixture first."""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from finance.fire import (
    calculate_fire,
    default_assumptions,
    return_for_age,
    simulate_goal_impact,
)

# Locked fixture: age 17, no goals/loans, Rs 10k/mo expenses + investment,
# Rs 28,295 corpus, inflation/step-up 6%, returns 12/10/8, lifespan 91.
FIXTURE_INPUTS = {
    "current_age": 17,
    "monthly_expenses_paise": 1000000,       # Rs 10,000/mo
    "monthly_investment_paise": 1000000,     # Rs 10,000/mo
    "current_corpus_paise": 2829500,         # Rs 28,295
    "inflation": 0.06,
    "step_up": 0.06,
    "return_before_40": 0.12,
    "return_40_to_60": 0.10,
    "return_after_60": 0.08,
    "post_fire_return": None,
    "lifespan_age": 91,
    "goals": [],
    "loans": [],
}


def test_locked_regression_fixture():
    result = calculate_fire(FIXTURE_INPUTS)
    assert result["fire_age"] == 31
    # ~Rs 56.71 lakh = 567,100,000 paise. NOTE: the brief's "5671000000"
    # carries an extra zero (that would be Rs 567 lakh); the engine's own
    # PV-recursion output is Rs 56,70,678. Tolerance Rs 10,000 either way.
    assert result["required_corpus_at_fire_paise"] == pytest.approx(
        567100000, abs=1000000
    )
    assert result["conservative_fire_age"] == 35
    assert result["implied_withdrawal_rate_pct"] == pytest.approx(
        4.8, abs=0.15
    )


def test_goal_pushes_fire_later_never_earlier():
    base = calculate_fire(FIXTURE_INPUTS)
    goal = {"goal_type": "CAR", "amount_today_paise": 50000000,
            "target_age": 25, "inflation_rate": 0.06}
    with_goal = calculate_fire({**FIXTURE_INPUTS, "goals": [goal]})
    assert with_goal["fire_age"] >= base["fire_age"]


def test_simulate_goal_impact_delta():
    goal = {"goal_type": "CAR", "amount_today_paise": 50000000,
            "target_age": 25, "inflation_rate": 0.06}
    result = simulate_goal_impact(FIXTURE_INPUTS, goal)
    assert result["baseline_fire_age"] == 31
    assert result["with_goal_fire_age"] >= 31
    assert result["delta_years"] == (
        result["with_goal_fire_age"] - result["baseline_fire_age"]
    )
    assert result["delta_years"] >= 0


def test_return_stage_boundaries_no_off_by_one():
    a = default_assumptions()
    assert return_for_age(39, a) == 0.12
    assert return_for_age(40, a) == 0.10
    assert return_for_age(60, a) == 0.10
    assert return_for_age(61, a) == 0.08


def test_inflation_raises_future_nominal_expenses():
    low = calculate_fire({**FIXTURE_INPUTS, "inflation": 0.02})
    high = calculate_fire({**FIXTURE_INPUTS, "inflation": 0.10})
    assert (high["required_corpus_at_fire_paise"]
            >= low["required_corpus_at_fire_paise"])


def test_step_up_compounds_year_over_year():
    from finance.fire import contribution_at_age

    base_annual = 120000.0
    c0 = contribution_at_age(base_annual, 17, 17, 0.06)
    c1 = contribution_at_age(base_annual, 18, 17, 0.06)
    c2 = contribution_at_age(base_annual, 19, 17, 0.06)
    assert c0 == pytest.approx(base_annual)
    assert c1 == pytest.approx(base_annual * 1.06)
    assert c2 == pytest.approx(base_annual * 1.06**2)


def test_education_goal_default_inflation_10pct():
    from finance.fire import goal_outflow_at_age

    edu = {"goal_type": "EDUCATION", "amount_today_paise": 10000000,
           "target_age": 27, "inflation_rate": None}
    other = {"goal_type": "CAR", "amount_today_paise": 10000000,
             "target_age": 27, "inflation_rate": None}
    assert goal_outflow_at_age(edu, 27, 17) > goal_outflow_at_age(
        other, 27, 17
    )
    assert goal_outflow_at_age(edu, 27, 17) == pytest.approx(
        10000000 * 1.10**10, rel=1e-9
    )


def test_result_shape_matches_fire_result():
    result = calculate_fire(FIXTURE_INPUTS)
    for key in ("fire_age", "required_corpus_at_fire_paise",
                "projected_corpus_at_fire_paise",
                "implied_withdrawal_rate_pct", "conservative_fire_age",
                "progress_pct_today", "assumptions", "required_curve",
                "projected_curve", "warnings"):
        assert key in result
    assert result["assumptions"]["lifespan_age"] == 91
    assert len(result["required_curve"]) == len(result["projected_curve"])
    assert result["required_curve"][0]["age"] == 17


def test_unreachable_fire_returns_none_with_warning():
    # Absurd expenses, tiny investment: FIRE never reached under assumptions
    inputs = {**FIXTURE_INPUTS, "monthly_expenses_paise": 100000000,
              "monthly_investment_paise": 1000,
              "current_corpus_paise": 0}
    result = calculate_fire(inputs)
    assert result["fire_age"] is None
    assert result["warnings"]
