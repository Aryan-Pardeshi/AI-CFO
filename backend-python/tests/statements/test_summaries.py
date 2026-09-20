import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from statements.dto import TransactionDTO
from statements.summaries import summarize_transactions


def _all_numbers(value):
    """Yield every numeric leaf in a summary dict/list, for isinstance(int) checks."""
    if isinstance(value, dict):
        for v in value.values():
            yield from _all_numbers(v)
    elif isinstance(value, list):
        for v in value:
            yield from _all_numbers(v)
    elif isinstance(value, (int, float)):
        yield value


def test_summary_returns_sorted_monthly_paise_series_and_totals():
    rows = [
        TransactionDTO("2", "2026-10-02", "Rent", 2000, "DEBIT"),
        TransactionDTO("1", "2026-09-01", "Salary", 10000, "CREDIT"),
        TransactionDTO("3", "2026-09-03", "Food", 1000, "DEBIT"),
    ]

    assert summarize_transactions(rows) == {
        "months": [
            {
                "month": "2026-09", "income_paise": 10000, "expense_paise": 1000, "net_paise": 9000,
                "categories": [{"category": None, "income_paise": 10000, "expense_paise": 1000, "net_paise": 9000}],
            },
            {
                "month": "2026-10", "income_paise": 0, "expense_paise": 2000, "net_paise": -2000,
                "categories": [{"category": None, "income_paise": 0, "expense_paise": 2000, "net_paise": -2000}],
            },
        ],
        "totals": {
            "income_paise": 10000, "expense_paise": 3000, "net_paise": 7000,
            "categories": [{"category": None, "income_paise": 10000, "expense_paise": 3000, "net_paise": 7000}],
        },
    }


def test_known_seed_statement_has_hand_checked_totals():
    from statements.categorizer import categorize_rows
    from statements.parser import parse_csv
    from statements.validator import validate_rows

    content = Path(__file__).resolve().parents[3].joinpath("seed", "test-statement.csv").read_bytes()
    parsed = parse_csv(content)
    validated, validation = validate_rows(parsed)
    summary = summarize_transactions(categorize_rows(validated))

    assert validation["row_count"] == 4
    assert validation["credit_total_paise"] == 8_500_000
    assert validation["debit_total_paise"] == 2_114_900
    assert summary["totals"] == {
        "income_paise": 8_500_000, "expense_paise": 2_114_900, "net_paise": 6_385_100,
        "categories": [
            {"category": "RENT", "income_paise": 0, "expense_paise": 2_000_000, "net_paise": -2_000_000},
            {"category": "SUBSCRIPTIONS", "income_paise": 0, "expense_paise": 64_900, "net_paise": -64_900},
            {"category": "FOOD_DELIVERY", "income_paise": 0, "expense_paise": 50_000, "net_paise": -50_000},
            {"category": "INCOME", "income_paise": 8_500_000, "expense_paise": 0, "net_paise": 8_500_000},
        ],
    }


def test_multiple_categories_in_one_month_are_bucketed_correctly():
    rows = [
        TransactionDTO("1", "2026-09-01", "Salary", 10000, "CREDIT", category="INCOME"),
        TransactionDTO("2", "2026-09-02", "Landlord", 3000, "DEBIT", category="RENT"),
        TransactionDTO("3", "2026-09-03", "Bigbasket", 2000, "DEBIT", category="GROCERIES"),
        TransactionDTO("4", "2026-09-04", "Zepto", 2000, "DEBIT", category="GROCERIES"),
    ]

    result = summarize_transactions(rows)

    assert len(result["months"]) == 1
    month = result["months"][0]
    assert month["month"] == "2026-09"
    assert month["categories"] == [
        {"category": "GROCERIES", "income_paise": 0, "expense_paise": 4000, "net_paise": -4000},
        {"category": "RENT", "income_paise": 0, "expense_paise": 3000, "net_paise": -3000},
        {"category": "INCOME", "income_paise": 10000, "expense_paise": 0, "net_paise": 10000},
    ]


def test_category_across_two_months_aggregates_in_totals_but_stays_split_per_month():
    rows = [
        TransactionDTO("1", "2026-09-01", "Airtel", 1000, "DEBIT", category="UTILITIES"),
        TransactionDTO("2", "2026-10-01", "Airtel", 4000, "DEBIT", category="UTILITIES"),
    ]

    result = summarize_transactions(rows)

    sept, oct = result["months"]
    assert sept["categories"] == [{"category": "UTILITIES", "income_paise": 0, "expense_paise": 1000, "net_paise": -1000}]
    assert oct["categories"] == [{"category": "UTILITIES", "income_paise": 0, "expense_paise": 4000, "net_paise": -4000}]
    assert result["totals"]["categories"] == [
        {"category": "UTILITIES", "income_paise": 0, "expense_paise": 5000, "net_paise": -5000},
    ]


def test_none_category_is_preserved_and_sorts_last_even_when_tied_on_expense():
    rows = [
        TransactionDTO("1", "2026-09-01", "Misc payment", 700, "DEBIT", category=None),
        TransactionDTO("2", "2026-09-02", "Some shop", 700, "DEBIT", category="ZETA"),
    ]

    result = summarize_transactions(rows)

    categories = result["months"][0]["categories"]
    assert categories == [
        {"category": "ZETA", "income_paise": 0, "expense_paise": 700, "net_paise": -700},
        {"category": None, "income_paise": 0, "expense_paise": 700, "net_paise": -700},
    ]
    assert categories[-1]["category"] is None


def test_sort_order_is_deterministic_when_categories_tie_on_expense_category_ascending_wins():
    rows = [
        TransactionDTO("1", "2026-09-01", "Beta shop", 500, "DEBIT", category="BETA"),
        TransactionDTO("2", "2026-09-02", "Alpha shop", 500, "DEBIT", category="ALPHA"),
    ]

    result = summarize_transactions(rows)

    assert result["months"][0]["categories"] == [
        {"category": "ALPHA", "income_paise": 0, "expense_paise": 500, "net_paise": -500},
        {"category": "BETA", "income_paise": 0, "expense_paise": 500, "net_paise": -500},
    ]


def test_exact_paise_arithmetic_with_no_float_drift():
    rows = [
        TransactionDTO("1", "2026-09-01", "Big credit", 99_999_999, "CREDIT", category="INCOME"),
        TransactionDTO("2", "2026-09-02", "Small debit a", 33, "DEBIT", category="MISC"),
        TransactionDTO("3", "2026-09-03", "Small debit b", 1, "DEBIT", category="MISC"),
    ]

    result = summarize_transactions(rows)

    assert result["totals"]["income_paise"] == 99_999_999
    assert result["totals"]["expense_paise"] == 34
    assert result["totals"]["net_paise"] == 99_999_965

    month = result["months"][0]
    misc = next(c for c in month["categories"] if c["category"] == "MISC")
    income = next(c for c in month["categories"] if c["category"] == "INCOME")
    assert misc == {"category": "MISC", "income_paise": 0, "expense_paise": 34, "net_paise": -34}
    assert income == {"category": "INCOME", "income_paise": 99_999_999, "expense_paise": 0, "net_paise": 99_999_999}

    for number in _all_numbers(result):
        assert isinstance(number, int)
        assert not isinstance(number, bool)


def test_empty_input_returns_empty_months_and_zeroed_totals_with_empty_categories():
    assert summarize_transactions([]) == {
        "months": [],
        "totals": {"income_paise": 0, "expense_paise": 0, "net_paise": 0, "categories": []},
    }


def test_month_with_only_credit_rows_and_month_with_only_debit_rows():
    rows = [
        TransactionDTO("1", "2026-01-01", "Salary", 50000, "CREDIT", category="INCOME"),
        TransactionDTO("2", "2026-01-02", "Bonus", 10000, "CREDIT", category="INCOME"),
        TransactionDTO("3", "2026-02-01", "Rent", 20000, "DEBIT", category="RENT"),
    ]

    result = summarize_transactions(rows)

    jan, feb = result["months"]
    assert jan["month"] == "2026-01"
    assert jan["income_paise"] == 60000
    assert jan["expense_paise"] == 0
    assert jan["net_paise"] == 60000
    assert jan["categories"] == [{"category": "INCOME", "income_paise": 60000, "expense_paise": 0, "net_paise": 60000}]

    assert feb["month"] == "2026-02"
    assert feb["income_paise"] == 0
    assert feb["expense_paise"] == 20000
    assert feb["net_paise"] == -20000
    assert feb["categories"] == [{"category": "RENT", "income_paise": 0, "expense_paise": 20000, "net_paise": -20000}]
