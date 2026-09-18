import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from statements.dto import TransactionDTO
from statements.validator import validate_rows


def test_validate_reconciles_running_balance_with_one_paise_tolerance():
    rows = [
        {"txn_date": "2026-09-01", "description": "Salary", "amount_paise": 10000, "direction": "CREDIT", "balance_paise": 11000},
        {"txn_date": "2026-09-02", "description": "Rent", "amount_paise": 1000, "direction": "DEBIT", "balance_paise": 10000},
    ]

    validated, summary = validate_rows(rows)

    assert all(isinstance(row, TransactionDTO) for row in validated)
    assert summary == {
        "row_count": 2,
        "credit_total_paise": 10000,
        "debit_total_paise": 1000,
        "net_paise": 9000,
        "reconciled": True,
        "balance_delta_paise": 0,
    }


def test_validate_rejects_non_positive_amounts_and_balance_mismatch():
    with pytest.raises(ValueError, match="positive"):
        validate_rows([
            {"txn_date": "2026-09-01", "description": "Bad", "amount_paise": 0, "direction": "DEBIT", "balance_paise": None},
        ])

    with pytest.raises(ValueError, match="balance"):
        validate_rows([
            {"txn_date": "2026-09-01", "description": "Salary", "amount_paise": 10000, "direction": "CREDIT", "balance_paise": 11000},
            {"txn_date": "2026-09-02", "description": "Rent", "amount_paise": 1000, "direction": "DEBIT", "balance_paise": 9998},
        ])


def test_validate_rejects_invalid_date_and_direction():
    with pytest.raises(ValueError, match="date"):
        validate_rows([
            {"txn_date": "09-01-2026", "description": "Bad", "amount_paise": 100, "direction": "DEBIT", "balance_paise": None},
        ])

    with pytest.raises(ValueError, match="direction"):
        validate_rows([
            {"txn_date": "2026-09-01", "description": "Bad", "amount_paise": 100, "direction": "SIDEWAYS", "balance_paise": None},
        ])


def _row(date="2026-09-01", description="Salary", amount=8500000, direction="CREDIT", balance=None):
    return {"txn_date": date, "description": description, "amount_paise": amount,
            "direction": direction, "balance_paise": balance}


def test_transaction_ids_are_content_addressed_and_stable():
    first, _ = validate_rows([_row(), _row(description="Rent", amount=2000000, direction="DEBIT")])
    again, _ = validate_rows([_row(), _row(description="Rent", amount=2000000, direction="DEBIT")])
    assert [r.txn_id for r in first] == [r.txn_id for r in again]
    assert len({r.txn_id for r in first}) == 2
    assert all(r.txn_id.startswith("t_") and len(r.txn_id) == 18 for r in first)


def test_identical_rows_in_one_statement_get_distinct_ids():
    rows, _ = validate_rows([_row(), _row()])
    assert rows[0].txn_id != rows[1].txn_id


def test_the_same_transaction_in_two_statements_gets_the_same_id():
    first, _ = validate_rows([_row(description="Rent", amount=2000000, direction="DEBIT")])
    second, _ = validate_rows([_row(), _row(description="Rent", amount=2000000, direction="DEBIT")])
    assert first[0].txn_id == second[1].txn_id


def test_different_transactions_at_the_same_row_position_do_not_collide():
    first, _ = validate_rows([_row(description="Salary")])
    second, _ = validate_rows([_row(description="Bonus", amount=100000)])
    assert first[0].txn_id != second[0].txn_id
