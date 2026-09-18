"""Bounded, deterministic CSV parsing for bank statement exports."""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

from .errors import StatementValidationError

MAX_BYTES = 1 * 1024 * 1024
MAX_ROWS = 1000


def _header(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").strip().lower()).strip()


def _money(value: str | None, *, field: str, positive: bool = True) -> int | None:
    text = (value or "").strip()
    if not text:
        return None
    text = text.replace(",", "").replace("₹", "").replace("INR", "").strip()
    if text.startswith("(") and text.endswith(")"):
        text = "-" + text[1:-1]
    try:
        amount = Decimal(text)
    except InvalidOperation as exc:
        raise StatementValidationError(f"{field} must be a valid amount") from exc
    if positive and amount <= 0:
        raise StatementValidationError(f"{field} must be positive")
    if amount.as_tuple().exponent < -2:
        raise StatementValidationError(f"{field} must have at most 2 decimals")
    return int(amount * 100)


def _date(value: str | None) -> str:
    text = (value or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    raise StatementValidationError("date must be ISO or dd/mm/yyyy")


def _direction(value: str | None) -> str:
    text = (value or "").strip().lower()
    if text in {"credit", "cr", "c", "deposit", "in", "received"}:
        return "CREDIT"
    if text in {"debit", "dr", "d", "withdrawal", "out", "paid"}:
        return "DEBIT"
    raise StatementValidationError("direction must be CREDIT or DEBIT")


def parse_csv(content: bytes) -> list[dict]:
    if not isinstance(content, (bytes, bytearray)):
        raise StatementValidationError("CSV content must be bytes")
    if len(content) > MAX_BYTES:
        raise StatementValidationError("CSV exceeds the 1 MiB upload limit")
    try:
        text = bytes(content).decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise StatementValidationError("CSV must be UTF-8") from exc

    reader = csv.DictReader(io.StringIO(text, newline=""))
    if not reader.fieldnames:
        raise StatementValidationError("CSV header is required")
    headers = {_header(name): name for name in reader.fieldnames if name is not None}
    date_key = next((headers[a] for a in ("date", "transaction date", "txn date", "value date") if a in headers), None)
    description_key = next((headers[a] for a in ("description", "narration", "particulars", "remarks", "merchant") if a in headers), None)
    debit_key = next((headers[a] for a in ("debit", "withdrawal", "withdrawals", "dr") if a in headers), None)
    credit_key = next((headers[a] for a in ("credit", "deposit", "deposits", "cr") if a in headers), None)
    amount_key = next((headers[a] for a in ("amount", "transaction amount", "txn amount") if a in headers), None)
    direction_key = next((headers[a] for a in ("direction", "type", "transaction type", "dr cr") if a in headers), None)
    balance_key = next((headers[a] for a in ("balance", "closing balance", "available balance") if a in headers), None)

    if not date_key or not description_key:
        raise StatementValidationError("CSV needs date and description/narration headers")
    if not ((debit_key or credit_key) or (amount_key and direction_key)):
        raise StatementValidationError("CSV needs debit/credit or amount plus direction headers")

    rows: list[dict] = []
    data_rows = 0
    for row_number, raw in enumerate(reader, start=2):
        if raw.get(None):
            raise StatementValidationError(f"row {row_number} has more columns than the header")
        if not any((value or "").strip() for value in raw.values() if value is not None):
            continue
        data_rows += 1
        if data_rows > MAX_ROWS:
            raise StatementValidationError("CSV exceeds the 1000 data-row limit")
        description = (raw.get(description_key) or "").strip()
        if not description:
            raise StatementValidationError(f"row {row_number} description is required")

        if amount_key and direction_key:
            amount = _money(raw.get(amount_key), field=f"row {row_number} amount")
            direction = _direction(raw.get(direction_key))
        else:
            debit = _money(raw.get(debit_key), field=f"row {row_number} debit") if debit_key else None
            credit = _money(raw.get(credit_key), field=f"row {row_number} credit") if credit_key else None
            if debit is not None and credit is not None:
                raise StatementValidationError(f"row {row_number} has both debit and credit")
            if debit is None and credit is None:
                raise StatementValidationError(f"row {row_number} needs a debit or credit")
            amount = debit if debit is not None else credit
            direction = "DEBIT" if debit is not None else "CREDIT"

        balance = _money(raw.get(balance_key), field=f"row {row_number} balance", positive=False) if balance_key else None
        rows.append({
            "txn_date": _date(raw.get(date_key)),
            "description": description,
            "amount_paise": amount,
            "direction": direction,
            "balance_paise": balance,
        })
    if not rows:
        raise StatementValidationError("CSV contains no transaction rows")
    return rows
