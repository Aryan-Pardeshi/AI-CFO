import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from statements.parser import MAX_BYTES, MAX_ROWS, parse_csv


def test_parse_common_bank_headers_and_dd_mm_yyyy_dates():
    content = (
        "Date,Narration,Withdrawal,Deposit,Balance\n"
        "01/09/2026,Salary,,85000.00,90000.00\n"
        "02/09/2026,SWIGGY,,500.00,89500.00\n"
    ).encode()

    rows = parse_csv(content)

    assert rows == [
        {
            "txn_date": "2026-09-01",
            "description": "Salary",
            "amount_paise": 8500000,
            "direction": "CREDIT",
            "balance_paise": 9000000,
        },
        {
            "txn_date": "2026-09-02",
            "description": "SWIGGY",
            "amount_paise": 50000,
            "direction": "CREDIT",
            "balance_paise": 8950000,
        },
    ]


def test_parse_amount_and_direction_headers_case_insensitively():
    rows = parse_csv(
        b"TRANSACTION DATE,DESCRIPTION,AMOUNT,TYPE\n"
        b"2026-09-01,Salary,85000,Credit\n"
        b"2026-09-02,Rent,20000,DEBIT\n"
    )

    assert rows[0]["direction"] == "CREDIT"
    assert rows[1]["direction"] == "DEBIT"
    assert rows[1]["amount_paise"] == 2000000


@pytest.mark.parametrize(
    "content",
    [
        b"date,description\n2026-09-01,Missing amount\n",
        b"date,description,debit,credit\n2026-09-01,Ambiguous,1,2\n",
        b"date,description,amount,direction\n2026-09-01,Unknown,1,sideways\n",
    ],
)
def test_parse_rejects_unusable_or_ambiguous_csv(content):
    with pytest.raises(ValueError):
        parse_csv(content)


def test_parse_enforces_byte_and_data_row_bounds():
    with pytest.raises(ValueError, match="1 MiB"):
        parse_csv(b"date,description,amount,direction\n" + b"x" * (MAX_BYTES + 1))

    rows = ["2026-09-01,merchant,1,debit"] * (MAX_ROWS + 1)
    with pytest.raises(ValueError, match="1000"):
        parse_csv(("date,description,amount,direction\n" + "\n".join(rows)).encode())
