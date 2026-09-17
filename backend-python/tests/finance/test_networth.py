"""Tests for finance/networth.py — totals, source rule, emergency fund, FD."""

import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from finance.networth import (
    calculate_net_worth,
    emergency_fund_coverage_months,
    fd_accrued_value_paise,
    project_net_worth,
)


def test_holdings_derived_wins_once_holdings_exist():
    result = calculate_net_worth(
        holdings_value_paise=50000000,
        fd_accrued_paise=0,
        cash_paise=1000000,
        declared_net_worth_paise=999999999,
        liabilities_paise=0,
        has_holdings=True,
    )
    assert result["net_worth_paise"] == 51000000
    assert result["source"] == "holdings"


def test_declared_fallback_with_no_holdings():
    result = calculate_net_worth(
        holdings_value_paise=0,
        fd_accrued_paise=0,
        cash_paise=1000000,
        declared_net_worth_paise=2000000,
        liabilities_paise=500000,
        has_holdings=False,
    )
    assert result["net_worth_paise"] == 1500000
    assert result["source"] == "declared"


def test_liabilities_subtracted_manual_override():
    result = calculate_net_worth(
        holdings_value_paise=10000000,
        fd_accrued_paise=0,
        cash_paise=0,
        declared_net_worth_paise=None,
        liabilities_paise=3000000,
        has_holdings=True,
    )
    assert result["net_worth_paise"] == 7000000
    assert result["total_liabilities_paise"] == 3000000


def test_emergency_fund_includes_emis():
    # cash 3,00,000; expenses 50,000/mo; EMIs 25,000+25,000 -> 3 months
    months = emergency_fund_coverage_months(
        cash_paise=30000000,
        monthly_expenses_paise=5000000,
        monthly_emi_paise_list=[2500000, 2500000],
    )
    assert months == pytest.approx(3.0)
    # without EMIs it would read 6 — EMIs must be in the denominator
    no_emi = emergency_fund_coverage_months(
        cash_paise=30000000,
        monthly_expenses_paise=5000000,
        monthly_emi_paise_list=[],
    )
    assert no_emi == pytest.approx(6.0)


def test_fd_accrued_quarterly_compounding():
    # P=100000 paise, r=8%, 2024-01-01 -> 2026-01-01 (731 days, leap year)
    got = fd_accrued_value_paise(
        principal_paise=100000,
        annual_rate=0.08,
        start_date=date(2024, 1, 1),
        as_of=date(2026, 1, 1),
    )
    t = 731 / 365.25
    assert got == pytest.approx(100000 * 1.02 ** (4 * t), rel=1e-9)


def test_fd_fractional_years():
    got = fd_accrued_value_paise(
        principal_paise=100000,
        annual_rate=0.08,
        start_date=date(2025, 7, 1),
        as_of=date(2026, 1, 1),
    )
    t = (date(2026, 1, 1) - date(2025, 7, 1)).days / 365.25
    assert got == pytest.approx(100000 * (1 + 0.08 / 4) ** (4 * t), rel=1e-9)


def test_projection_uses_fire_assumptions_and_drawdown():
    # Post-FIRE-age years must draw down (expenses out), not accumulate.
    inputs = {
        "current_age": 30,
        "current_invested_paise": 10000000,
        "monthly_expenses_paise": 5000000,
        "monthly_investment_paise": 5000000,
        "goals": [],
        "loans": [],
        "fire_age": 31,
    }
    curve = project_net_worth(inputs, years=10)
    assert len(curve) == 11
    # pre-FIRE year grows (contributions + returns)
    assert curve[1]["corpus_paise"] > curve[0]["corpus_paise"]
    # far post-FIRE with big expenses vs small corpus must decline somewhere
    assert any(
        curve[i + 1]["corpus_paise"] < curve[i]["corpus_paise"]
        for i in range(1, len(curve) - 1)
    )


def test_projection_imports_fire_defaults():
    import finance.networth as nw
    import finance.fire as fire

    assert nw.default_assumptions is fire.default_assumptions
