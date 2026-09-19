"""Tests for finance/tax.py â€” locked FY 2026-27 slabs and capital gains."""

import pytest

from finance.tax import (
    compare_tax_regimes,
    estimate_capital_gains_tax,
    estimate_income_tax,
)


@pytest.mark.parametrize(
    "regime,income_paise,expected_tax_before_rebate_paise,expected_tax_paise",
    [
        ("new", 0, 0, 0),
        ("new", 40000000, 0, 0),
        ("new", 80000000, 2000000, 0),
        ("new", 120000000, 6000000, 0),
        ("new", 160000000, 12000000, 12480000),
        ("new", 200000000, 20000000, 20800000),
        ("new", 240000000, 30000000, 31200000),
        ("new", 250000000, 33000000, 34320000),
        ("old", 0, 0, 0),
        ("old", 25000000, 0, 0),
        ("old", 50000000, 1250000, 0),
        ("old", 100000000, 11250000, 11700000),
        ("old", 110000000, 14250000, 14820000),
    ],
)
def test_income_tax_slabs_and_cess(
    regime, income_paise, expected_tax_before_rebate_paise, expected_tax_paise
):
    result = estimate_income_tax(
        taxable_income_paise=income_paise,
        regime=regime,
    )

    assert result["taxable_income_paise"] == income_paise
    assert result["tax_before_rebate_paise"] == expected_tax_before_rebate_paise
    assert result["tax_paise"] == expected_tax_paise
    assert result["cess_paise"] == (
        expected_tax_paise - result["tax_after_rebate_paise"]
    )
    assert "estimate" in result["disclaimer"].lower()


def test_standard_deduction_is_applied_before_rebate():
    result = estimate_income_tax(income_paise=127500000, regime="new")

    assert result["standard_deduction_paise"] == 7500000
    assert result["taxable_income_paise"] == 120000000
    assert result["tax_paise"] == 0


def test_rebate_cliff_is_visible_above_new_regime_threshold():
    result = estimate_income_tax(
        taxable_income_paise=120000100,
        regime="new",
    )

    assert result["rebate_paise"] == 0
    assert result["tax_paise"] == 6240015
    assert any("marginal relief" in warning.lower() for warning in result["warnings"])


def test_compare_tax_regimes_returns_both_and_lower_regime():
    result = compare_tax_regimes(income_paise=200000000)

    assert set(result) == {
        "new_regime",
        "old_regime",
        "lower_regime",
        "warnings",
        "disclaimer",
    }
    assert result["new_regime"]["tax_paise"] < result["old_regime"]["tax_paise"]
    assert result["lower_regime"] == "new"


def test_capital_gains_ltcg_exemption_can_be_shared_across_sales():
    first = estimate_capital_gains_tax(
        gain_paise=20000000,
        asset_type="LISTED_EQUITY",
        holding_period_months=13,
    )
    second = estimate_capital_gains_tax(
        gain_paise=20000000,
        asset_type="LISTED_EQUITY",
        holding_period_months=13,
        annual_exemption_used_paise=20000000,
    )

    assert first["exemption_applied_paise"] == 12500000
    assert first["taxable_gain_paise"] == 7500000
    assert second["exemption_applied_paise"] == 0
    assert second["taxable_gain_paise"] == 20000000
    assert second["tax_paise"] > first["tax_paise"]
    assert any(
        "1.25 lakh" in warning.lower() or "1.25 lakh" in warning
        for warning in second["warnings"]
    )


def test_capital_gains_ltcg_applies_only_remaining_exemption():
    result = estimate_capital_gains_tax(
        gain_paise=20000000,
        asset_type="LISTED_EQUITY",
        holding_period_months=13,
        annual_exemption_used_paise=5000000,
    )

    assert result["exemption_applied_paise"] == 7500000
    assert result["taxable_gain_paise"] == 12500000


@pytest.mark.parametrize(
    "kwargs",
    [
        {"taxable_income_paise": 500000001},
        {"taxable_income_paise": 10000000, "resident": False},
        {"taxable_income_paise": 10000000, "age": 60},
    ],
)
def test_income_tax_out_of_scope_returns_warning_without_number(kwargs):
    result = estimate_income_tax(**kwargs)

    assert result["tax_paise"] is None
    assert result["warnings"]
    assert "out of scope" in result["warnings"][0].lower()


def test_capital_gains_ltcg_exemption_boundary():
    at_boundary = estimate_capital_gains_tax(
        gain_paise=12500000,
        asset_type="LISTED_EQUITY",
        holding_period_months=13,
    )
    above_boundary = estimate_capital_gains_tax(
        gain_paise=12510000,
        asset_type="LISTED_EQUITY",
        holding_period_months=13,
    )

    assert at_boundary["taxable_gain_paise"] == 0
    assert at_boundary["tax_paise"] == 0
    assert above_boundary["taxable_gain_paise"] == 10000
    assert above_boundary["tax_paise"] == 1300


def test_capital_gains_equity_stcg_is_twenty_percent():
    result = estimate_capital_gains_tax(
        gain_paise=10000000,
        asset_type="EQUITY_MUTUAL_FUND",
        holding_period_months=12,
    )

    assert result["tax_rate_pct"] == 20.0
    assert result["tax_paise"] == 2080000


def test_capital_gains_debt_mutual_fund_uses_slab_rate():
    result = estimate_capital_gains_tax(
        gain_paise=100000000,
        asset_type="DEBT_MUTUAL_FUND",
        purchase_date="2024-04-01",
        taxable_income_paise=120000000,
        regime="new",
    )

    assert result["tax_rate_type"] == "slab"
    assert result["tax_paise"] == 26000000
    assert result["indexation_applied"] is False
