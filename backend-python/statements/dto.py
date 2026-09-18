"""AWS-free transaction DTOs used by the statement pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class TransactionDTO:
    txn_id: str
    txn_date: str
    description: str
    amount_paise: int
    direction: str
    category: str | None = None
    category_source: str | None = None
    balance_paise: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
