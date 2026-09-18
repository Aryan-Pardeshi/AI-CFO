"""Deterministic cash-flow aggregation."""

from __future__ import annotations

from collections import defaultdict

from .dto import TransactionDTO


def summarize_transactions(rows: list[TransactionDTO]) -> dict:
    monthly: dict[str, dict[str, int]] = defaultdict(lambda: {"income_paise": 0, "expense_paise": 0})
    income = 0
    expense = 0
    for row in rows:
        month = row.txn_date[:7]
        if row.direction == "CREDIT":
            monthly[month]["income_paise"] += row.amount_paise
            income += row.amount_paise
        else:
            monthly[month]["expense_paise"] += row.amount_paise
            expense += row.amount_paise
    months = [
        {
            "month": month,
            "income_paise": values["income_paise"],
            "expense_paise": values["expense_paise"],
            "net_paise": values["income_paise"] - values["expense_paise"],
        }
        for month, values in sorted(monthly.items())
    ]
    return {
        "months": months,
        "totals": {"income_paise": income, "expense_paise": expense, "net_paise": income - expense},
    }
