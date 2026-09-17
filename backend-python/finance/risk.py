"""Portfolio-level volatility — pure, no I/O.

sqrt(w^T Sigma w) on daily returns INNER-JOINED by date across assets.
Never a weighted average of individual volatilities.

Composes finance/returns.py helpers — no duplicated return/stdev math.
"""

from __future__ import annotations

import math

import numpy as np

from .returns import TRADING_DAYS, period_returns

MIN_ALIGNED_DAYS = 120


def align_price_history(
    price_history: dict[str, list[tuple]],
) -> tuple[list, dict[str, list[float]]]:
    """Inner join by date. Returns (sorted common dates, {asset: prices})."""
    date_sets = []
    lookup: dict[str, dict] = {}
    for asset, series in price_history.items():
        mapping = {}
        for d, p in series:
            if p is not None:
                mapping[d] = p
        lookup[asset] = mapping
        date_sets.append(set(mapping))
    common = sorted(set.intersection(*date_sets)) if date_sets else []
    aligned = {
        asset: [lookup[asset][d] for d in common] for asset in price_history
    }
    return common, aligned


def portfolio_volatility(
    price_history: dict[str, list[tuple]],
    weights: dict[str, float],
    min_aligned_days: int = MIN_ALIGNED_DAYS,
) -> dict:
    """Annualized portfolio volatility (decimal fraction).

    Success: {"ok": True, "annualized_volatility": ..., "aligned_days": N,
              "assets": [...]}.
    Too little overlap: {"ok": False, "code": "INSUFFICIENT_DATA",
                         "aligned_days": N, "message": ...}.
    """
    dates, aligned = align_price_history(price_history)
    n = len(dates)
    if n < min_aligned_days:
        return {
            "ok": False,
            "code": "INSUFFICIENT_DATA",
            "aligned_days": n,
            "message": (
                f"Only {n} aligned days of overlapping history; "
                f"need >= {min_aligned_days} for portfolio volatility"
            ),
        }
    assets = sorted(price_history.keys())
    total_w = sum(weights.get(a, 0.0) for a in assets)
    if total_w <= 0:
        return {
            "ok": False,
            "code": "INSUFFICIENT_DATA",
            "aligned_days": n,
            "message": "No positive portfolio weights",
        }
    w = np.array([weights.get(a, 0.0) / total_w for a in assets], dtype=float)
    rets = np.array([period_returns(aligned[a]) for a in assets], dtype=float)
    cov = np.cov(rets, ddof=1)  # ddof=1 locked
    if cov.ndim == 0:  # single asset edge
        cov = np.array([[float(cov)]])
    var = float(w @ cov @ w)
    var = max(var, 0.0)  # float noise guard
    return {
        "ok": True,
        "annualized_volatility": math.sqrt(TRADING_DAYS * var),
        "aligned_days": n,
        "assets": assets,
    }
