"""Credit-card payoff illustration math â€” pure and issuer-neutral."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP


DISCLAIMER = "Estimate based on a constant monthly rate and payment; not financial advice."


def _paise(value: Decimal) -> int:
    return int(value.to_integral_value(rounding=ROUND_HALF_UP))


def _result(months, interest, never_amortises, warnings):
    return {
        "months_to_clear": months,
        "months": months,
        "total_interest_paise": interest,
        "total_interest": interest,
        "never_amortises": never_amortises,
        "never_amortizes": never_amortises,
        "status": "NEVER_AMORTISES" if never_amortises else "OK",
        "warnings": warnings,
        "disclaimer": DISCLAIMER,
    }


def calculate_credit_card_payoff(
    outstanding_paise: int,
    monthly_interest_pct: float,
    monthly_payment_paise: int,
) -> dict:
    """Return months and interest, or flag a payment that cannot amortise."""
    if outstanding_paise < 0 or monthly_payment_paise < 0 or monthly_interest_pct < 0:
        raise ValueError("outstanding, payment, and interest rate cannot be negative")
    if outstanding_paise == 0:
        return _result(0, 0, False, [])

    rate = Decimal(str(monthly_interest_pct)) / Decimal(100)
    balance = int(outstanding_paise)
    first_interest = _paise(Decimal(balance) * rate)
    if monthly_payment_paise <= first_interest:
        return _result(None, None, True, [
                "Monthly payment is at or below the first month's interest charge; the balance never amortises."
            ])

    months = 0
    total_interest = 0
    while balance > 0:
        interest = _paise(Decimal(balance) * rate)
        total_due = balance + interest
        payment = min(monthly_payment_paise, total_due)
        principal = payment - interest
        if principal <= 0:
            return _result(None, None, True, [
                    "Monthly payment does not reduce principal after rounding; the balance never amortises."
                ])
        balance -= principal
        total_interest += interest
        months += 1

    return _result(months, total_interest, False, [])
