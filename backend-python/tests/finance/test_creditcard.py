"""Tests for finance/creditcard.py â€” deterministic payoff illustrations."""

from finance.creditcard import calculate_credit_card_payoff


def test_credit_card_payoff_calculates_months_and_interest():
    result = calculate_credit_card_payoff(
        outstanding_paise=100000,
        monthly_interest_pct=1.0,
        monthly_payment_paise=110000,
    )

    assert result["months_to_clear"] == 1
    assert result["total_interest_paise"] == 1000
    assert result["never_amortises"] is False
    assert "estimate" in result["disclaimer"].lower()


def test_credit_card_payoff_flags_never_amortises_minimum_due():
    result = calculate_credit_card_payoff(
        outstanding_paise=100000,
        monthly_interest_pct=3.0,
        monthly_payment_paise=3000,
    )

    assert result["never_amortises"] is True
    assert result["months_to_clear"] is None
    assert result["total_interest_paise"] is None
    assert result["warnings"]


def test_credit_card_payoff_zero_interest_is_integer_months():
    result = calculate_credit_card_payoff(
        outstanding_paise=100000,
        monthly_interest_pct=0.0,
        monthly_payment_paise=25000,
    )

    assert result["months_to_clear"] == 4
    assert result["total_interest_paise"] == 0

