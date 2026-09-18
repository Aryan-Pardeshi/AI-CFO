import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from statements.categorizer import categorize_rows
from statements.dto import TransactionDTO


def test_categorize_uses_deterministic_keyword_rules_first():
    rows = [
        TransactionDTO("t1", "2026-09-01", "Salary ACME", 100000, "CREDIT"),
        TransactionDTO("t2", "2026-09-02", "UPI SWIGGY", 500, "DEBIT"),
        TransactionDTO("t3", "2026-09-03", "NACH EMI HDFC", 10000, "DEBIT"),
        TransactionDTO("t4", "2026-09-04", "Unknown merchant", 100, "DEBIT"),
    ]

    categorized = categorize_rows(rows)

    assert [row.category for row in categorized] == ["INCOME", "FOOD_DELIVERY", "EMI", "OTHER"]
    assert [row.category_source for row in categorized] == ["rule", "rule", "rule", "rule"]


def _category(description):
    row = TransactionDTO(txn_id="t", txn_date="2026-09-01", description=description,
                         amount_paise=100, direction="DEBIT")
    return categorize_rows([row])[0].category


def test_keywords_match_whole_words_only():
    assert _category("Coca Cola vending") == "OTHER"
    assert _category("Premium membership") == "OTHER"
    assert _category("Gossip magazine") == "OTHER"
    assert _category("Current account fee") == "OTHER"


def test_real_keywords_still_match_as_words():
    assert _category("OLA CABS 1234") == "TRANSPORT"
    assert _category("HOME LOAN EMI 03") == "EMI"
    assert _category("Monthly rent") == "RENT"
    assert _category("SIP - Parag Parikh") == "INVESTMENTS"
