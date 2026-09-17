"""Portfolio holdings math — pure, no I/O.

Conventions: money integer paise in/out; weights as 0-100 floats.
Denominator: all investment holdings including FD, excluding CASH
(CASH is never a holding row — users.cash_balance_paise — but excluded
defensively if one ever arrives here).

Input holdings: list of dicts with at least:
  holding_id, symbol, asset_type, value_paise (int),
  optional: quantity, avg_buy_price_paise, sector.
"""

from __future__ import annotations

CONCENTRATION_THRESHOLD_PCT = 25.0

_WARNING_TYPES = {"STOCK", "CRYPTO"}
_INFO_TYPES = {"ETF", "MUTUAL_FUND"}


def _weight(value_paise: int, total_paise: int) -> float:
    if total_paise <= 0:
        return 0.0
    return value_paise / total_paise * 100.0


def holding_pnl(
    value_paise: int,
    quantity: float | None,
    avg_buy_price_paise: int | None,
) -> dict | None:
    """Unrealized P&L. None when no cost basis — omitted, never zero-filled."""
    if quantity is None or avg_buy_price_paise is None:
        return None
    cost = quantity * avg_buy_price_paise
    pnl = int(round(value_paise - cost))
    pct = (value_paise / cost - 1.0) * 100.0 if cost > 0 else None
    return {"pnl_paise": pnl, "pnl_pct": pct}


def allocation_by(
    holdings: list[dict], field: str, total_paise: int
) -> list[dict]:
    """Aggregate {key, value_paise, weight_pct} by asset_type or sector."""
    buckets: dict[str, int] = {}
    for h in holdings:
        if h.get("asset_type") == "CASH":
            continue
        key = h.get(field) or "UNKNOWN"
        buckets[key] = buckets.get(key, 0) + int(h.get("value_paise") or 0)
    return [
        {"key": k, "value_paise": v, "weight_pct": _weight(v, total_paise)}
        for k, v in sorted(buckets.items())
    ]


def concentration_flags(weighted_holdings: list[dict]) -> list[dict]:
    """Locked rule: strict > 25. Exactly 25.00 never flags. FD/CASH never flag."""
    flags = []
    for h in weighted_holdings:
        asset_type = h.get("asset_type")
        weight = h.get("weight_pct") or 0.0
        if weight <= CONCENTRATION_THRESHOLD_PCT:
            continue
        if asset_type in _WARNING_TYPES:
            severity = "warning"
        elif asset_type in _INFO_TYPES:
            severity = "info"
        else:
            continue  # FD, CASH, OTHER never flagged
        flags.append(
            {
                "code": "HOLDING_CONCENTRATION",
                "symbol": h.get("symbol"),
                "weight_pct": weight,
                "threshold_pct": CONCENTRATION_THRESHOLD_PCT,
                "severity": severity,
            }
        )
    return flags


def analyze_portfolio(holdings: list[dict]) -> dict:
    """Value, weights, allocations, P&L, concentration flags for priced holdings."""
    priced = [h for h in holdings if h.get("asset_type") != "CASH"]
    total_value = sum(int(h.get("value_paise") or 0) for h in priced)

    weighted = []
    total_cost = 0
    for h in priced:
        value = int(h.get("value_paise") or 0)
        pnl = holding_pnl(
            value, h.get("quantity"), h.get("avg_buy_price_paise")
        )
        cost_basis = 0
        if h.get("quantity") is not None and h.get("avg_buy_price_paise") is not None:
            cost_basis = int(round(h["quantity"] * h["avg_buy_price_paise"]))
            total_cost += cost_basis
        weighted.append(
            {
                "holding_id": h.get("holding_id"),
                "symbol": h.get("symbol"),
                "asset_type": h.get("asset_type"),
                "quantity": h.get("quantity"),
                "value_paise": value,
                "weight_pct": _weight(value, total_value),
                "pnl_paise": pnl["pnl_paise"] if pnl else None,
                "pnl_pct": pnl["pnl_pct"] if pnl else None,
            }
        )

    pnl_total = total_value - total_cost
    return {
        "total_value_paise": total_value,
        "total_cost_paise": total_cost,
        "unrealized_pnl_paise": pnl_total,
        "unrealized_pnl_pct": (
            (total_value / total_cost - 1.0) * 100.0 if total_cost > 0 else None
        ),
        "holdings": weighted,
        "allocation_by_asset_type": allocation_by(
            priced, "asset_type", total_value
        ),
        "allocation_by_sector": allocation_by(priced, "sector", total_value),
        "flags": concentration_flags(weighted),
    }
