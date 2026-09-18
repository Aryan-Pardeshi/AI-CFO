import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from statements.dto import TransactionDTO
from statements.summaries import summarize_transactions


def test_summary_returns_sorted_monthly_paise_series_and_totals():
    rows = [
        TransactionDTO("2", "2026-10-02", "Rent", 2000, "DEBIT"),
        TransactionDTO("1", "2026-09-01", "Salary", 10000, "CREDIT"),
        TransactionDTO("3", "2026-09-03", "Food", 1000, "DEBIT"),
    ]

    assert summarize_transactions(rows) == {
        "months": [
            {"month": "2026-09", "income_paise": 10000, "expense_paise": 1000, "net_paise": 9000},
            {"month": "2026-10", "income_paise": 0, "expense_paise": 2000, "net_paise": -2000},
        ],
        "totals": {"income_paise": 10000, "expense_paise": 3000, "net_paise": 7000},
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
    assert summary["totals"] == {"income_paise": 8_500_000, "expense_paise": 2_114_900, "net_paise": 6_385_100}
