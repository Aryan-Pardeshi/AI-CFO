"""Validation and reconciliation of normalized statement rows."""

from __future__ import annotations

import hashlib
from datetime import date

from .dto import TransactionDTO
from .errors import StatementValidationError


def _iso_date(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError) as exc:
        raise StatementValidationError("date must be ISO or dd/mm/yyyy") from exc


def _txn_id(txn_date: str, direction: str, amount: int, description: str,
            balance: int | None, occurrence: int) -> str:
    """Stable id from the transaction's own content, not its position.

    The same transaction in an overlapping statement gets the same id (so the
    conditional write dedupes it), while different transactions never collide
    just because they sit at the same row number. `occurrence` separates
    genuinely identical rows inside one statement (two equal coffees).
    """
    normalized = " ".join(description.casefold().split())
    key = "|".join([txn_date, direction, str(amount), normalized,
                    "" if balance is None else str(balance), str(occurrence)])
    return "t_" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def validate_rows(rows: list[dict]) -> tuple[list[TransactionDTO], dict]:
    if not rows:
        raise StatementValidationError("statement contains no rows")
    validated: list[TransactionDTO] = []
    credit_total = 0
    debit_total = 0
    comparisons = 0
    max_delta = 0
    previous_balance: int | None = None
    seen: dict[tuple, int] = {}
    for index, row in enumerate(rows, start=1):
        try:
            txn_date = _iso_date(row.get("txn_date"))
        except StatementValidationError as exc:
            raise StatementValidationError(f"row {index} date is invalid") from exc
        description = str(row.get("description") or "").strip()
        if not description:
            raise StatementValidationError(f"row {index} description is required")
        amount = row.get("amount_paise")
        if not isinstance(amount, int) or amount <= 0:
            raise StatementValidationError(f"row {index} amount must be positive")
        direction = row.get("direction")
        if direction not in {"CREDIT", "DEBIT"}:
            raise StatementValidationError(f"row {index} direction is invalid")
        balance = row.get("balance_paise")
        if balance is not None and not isinstance(balance, int):
            raise StatementValidationError(f"row {index} balance is invalid")
        if direction == "CREDIT":
            credit_total += amount
        else:
            debit_total += amount
        if previous_balance is not None and balance is not None:
            expected = previous_balance + (amount if direction == "CREDIT" else -amount)
            delta = balance - expected
            comparisons += 1
            max_delta = max(max_delta, abs(delta))
            if abs(delta) > 1:
                raise StatementValidationError(f"row {index} running balance does not reconcile")
        if balance is not None:
            previous_balance = balance
        identity = (txn_date, direction, amount, " ".join(description.casefold().split()), balance)
        occurrence = seen.get(identity, 0)
        seen[identity] = occurrence + 1
        validated.append(TransactionDTO(
            txn_id=_txn_id(txn_date, direction, amount, description, balance, occurrence),
            txn_date=txn_date,
            description=description,
            amount_paise=amount,
            direction=direction,
            balance_paise=balance,
        ))
    return validated, {
        "row_count": len(validated),
        "credit_total_paise": credit_total,
        "debit_total_paise": debit_total,
        "net_paise": credit_total - debit_total,
        "reconciled": True,
        "balance_delta_paise": max_delta if comparisons else 0,
    }
