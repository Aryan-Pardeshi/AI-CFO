"""Deterministic cash-flow aggregation."""

from __future__ import annotations

from collections import defaultdict

from .dto import TransactionDTO


def _category_sort_key(entry: dict) -> tuple:
    category = entry["category"]
    # None always sorts after every real category, ties broken by category ascending.
    rank = (1, "") if category is None else (0, category)
    return (-entry["expense_paise"], rank)


def _build_categories(cat_map: dict) -> list[dict]:
    entries = [
        {
            "category": category,
            "income_paise": values["income_paise"],
            "expense_paise": values["expense_paise"],
            "net_paise": values["income_paise"] - values["expense_paise"],
        }
        for category, values in cat_map.items()
    ]
    entries.sort(key=_category_sort_key)
    return entries


def summarize_transactions(rows: list[TransactionDTO]) -> dict:
    monthly: dict[str, dict[str, int]] = defaultdict(lambda: {"income_paise": 0, "expense_paise": 0})
    month_categories: dict[str, dict] = defaultdict(
        lambda: defaultdict(lambda: {"income_paise": 0, "expense_paise": 0})
    )
    total_categories: dict = defaultdict(lambda: {"income_paise": 0, "expense_paise": 0})
    income = 0
    expense = 0
    for row in rows:
        month = row.txn_date[:7]
        category = row.category
        month_bucket = monthly[month]
        month_cat_bucket = month_categories[month][category]
        total_cat_bucket = total_categories[category]
        if row.direction == "CREDIT":
            month_bucket["income_paise"] += row.amount_paise
            month_cat_bucket["income_paise"] += row.amount_paise
            total_cat_bucket["income_paise"] += row.amount_paise
            income += row.amount_paise
        else:
            month_bucket["expense_paise"] += row.amount_paise
            month_cat_bucket["expense_paise"] += row.amount_paise
            total_cat_bucket["expense_paise"] += row.amount_paise
            expense += row.amount_paise
    months = [
        {
            "month": month,
            "income_paise": values["income_paise"],
            "expense_paise": values["expense_paise"],
            "net_paise": values["income_paise"] - values["expense_paise"],
            "categories": _build_categories(month_categories[month]),
        }
        for month, values in sorted(monthly.items())
    ]
    return {
        "months": months,
        "totals": {
            "income_paise": income,
            "expense_paise": expense,
            "net_paise": income - expense,
            "categories": _build_categories(total_categories),
        },
    }
