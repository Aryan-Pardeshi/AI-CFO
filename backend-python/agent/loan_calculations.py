"""Canonical deterministic loan calculations used by agent tools."""
from __future__ import annotations
from decimal import Decimal, ROUND_HALF_UP


def _round(value: Decimal) -> int:
    return int(value.to_integral_value(rounding=ROUND_HALF_UP))


def monthly_emi_paise(principal_paise: int, annual_rate: float, tenure_months: int) -> int:
    if principal_paise < 0 or annual_rate < 0 or tenure_months < 1:
        raise ValueError("invalid loan inputs")
    principal = Decimal(principal_paise)
    if not annual_rate:
        return _round(principal / tenure_months)
    rate = Decimal(str(annual_rate)) / Decimal(12)
    factor = (Decimal(1) + rate) ** tenure_months
    return _round(principal * rate * factor / (factor - Decimal(1)))


def _interest_schedule(principal_paise: int, annual_rate: float, payment_paise: int) -> tuple[int, int]:
    balance = int(principal_paise)
    rate = Decimal(str(annual_rate)) / Decimal(12)
    interest_total = 0
    months = 0
    while balance > 0 and months < 10000:
        interest = _round(Decimal(balance) * rate)
        payment = min(payment_paise, balance + interest)
        principal = payment - interest
        if principal <= 0:
            raise ValueError("payment does not amortise loan")
        balance -= principal
        interest_total += interest
        months += 1
    return months, interest_total


def prepayment_impact(principal_paise: int, annual_rate: float, tenure_months: int,
                      prepayment_paise: int, charge_pct: float = 0) -> dict:
    if principal_paise <= 0 or prepayment_paise < 0 or prepayment_paise >= principal_paise:
        raise ValueError("invalid prepayment")
    if not 0 <= annual_rate <= 0.36 or not 1 <= tenure_months <= 480 or not 0 <= charge_pct <= 100:
        raise ValueError("invalid loan terms")
    emi = monthly_emi_paise(principal_paise, annual_rate, tenure_months)
    original_months, original_interest = _interest_schedule(principal_paise, annual_rate, emi)
    revised_months, revised_interest = _interest_schedule(principal_paise - prepayment_paise, annual_rate, emi)
    charge = _round(Decimal(prepayment_paise) * Decimal(str(charge_pct)) / Decimal(100))
    return {
        "mode": "reduce_tenure", "monthly_emi_paise": emi,
        "original_tenure_months": original_months,
        "revised_tenure_months": revised_months,
        "prepayment_paise": prepayment_paise,
        "prepayment_charge_paise": charge,
        "interest_saving_paise": max(0, original_interest - revised_interest - charge),
        "warnings": [],
    }
