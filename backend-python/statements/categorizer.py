"""Deterministic, explainable transaction categories."""

from __future__ import annotations

import re

from .dto import TransactionDTO

_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("INCOME", ("salary", "wages", "payroll", "bonus", "pension")),
    ("FOOD_DELIVERY", ("swiggy", "zomato", "blinkit food", "foodpanda")),
    ("SUBSCRIPTIONS", ("netflix", "spotify", "prime video", "hotstar", "youtube premium")),
    ("EMI", ("emi", "nach", "loan repayment", "loan payment")),
    ("RENT", ("rent", "landlord")),
    ("GROCERIES", ("grocery", "groceries", "bigbasket", "zepto", "dmart")),
    ("TRANSPORT", ("uber", "ola", "rapido", "metro", "fuel", "petrol")),
    ("UTILITIES", ("electricity", "water bill", "gas bill", "airtel", "jio", "broadband")),
    ("HEALTH", ("hospital", "pharmacy", "apollo", "clinic", "medical")),
    ("EDUCATION", ("school", "college", "tuition", "course fee")),
    ("INVESTMENTS", ("sip", "mutual fund", "zerodha", "groww", "brokerage")),
    ("DINING", ("restaurant", "cafe", "swiggy dine", "bar ")),
    ("SHOPPING", ("amazon", "flipkart", "myntra", "shopping")),
    ("TRANSFER", ("transfer", "self transfer", "upi transfer")),
)


def _word_pattern(keyword: str) -> re.Pattern[str]:
    # Whole-word match so "ola" does not fire on "Coca Cola" or "emi" on "Premium".
    return re.compile(r"(?<![a-z0-9])" + re.escape(keyword.strip()) + r"(?![a-z0-9])")


_COMPILED = tuple((category, tuple(_word_pattern(k) for k in keywords)) for category, keywords in _RULES)


def categorize_rows(rows: list[TransactionDTO]) -> list[TransactionDTO]:
    categorized: list[TransactionDTO] = []
    for row in rows:
        text = row.description.casefold()
        category = "OTHER"
        for candidate, patterns in _COMPILED:
            if any(pattern.search(text) for pattern in patterns):
                category = candidate
                break
        categorized.append(TransactionDTO(
            txn_id=row.txn_id,
            txn_date=row.txn_date,
            description=row.description,
            amount_paise=row.amount_paise,
            direction=row.direction,
            category=category,
            category_source="rule",
            balance_paise=row.balance_paise,
        ))
    return categorized
