"""Return/volatility/CAGR/drawdown/Sharpe math — pure, no I/O.

Ratio math may use numpy floats; money never flows through here.
Standard deviation is ALWAYS sample (ddof=1) — written explicitly so a
numpy/pandas swap can never silently regress to ddof=0.
"""

from __future__ import annotations

import math
from datetime import date

import numpy as np

TRADING_DAYS = 252
MONTHS = 12
DAYS_PER_YEAR = 365.25


def period_returns(prices: list[float | None]) -> list[float]:
    """Simple returns r_t = P_t / P_{t-1} - 1. Leading/None gaps dropped."""
    clean = [p for p in prices if p is not None]
    rets = []
    for prev, cur in zip(clean, clean[1:]):
        if prev is None or cur is None or prev <= 0:
            continue
        rets.append(cur / prev - 1.0)
    return rets


def annualized_volatility(
    returns: list[float], freq: str = "daily"
) -> float:
    """Annualized sample std. Constant series -> 0.0, never NaN."""
    arr = np.asarray(
        [r for r in returns if r is not None and not math.isnan(r)],
        dtype=float,
    )
    if arr.size < 2:
        return 0.0
    sample_std = float(np.std(arr, ddof=1))  # ddof=1 locked, never default
    if math.isnan(sample_std):
        return 0.0
    factor = math.sqrt(TRADING_DAYS) if freq == "daily" else math.sqrt(MONTHS)
    return sample_std * factor


def volatility_from_prices(
    prices: list[float | None], freq: str = "daily"
) -> float:
    """pct_change-style NaNs dropped intentionally, not propagated."""
    return annualized_volatility(period_returns(prices), freq=freq)


def cagr(
    start_value: float,
    end_value: float,
    start_date: date,
    end_date: date,
) -> tuple[float | None, bool, str | None]:
    """(value, is_annualized, warning). <1yr -> plain period return + warning."""
    if start_value is None or start_value <= 0:
        return None, False, "CAGR unavailable: non-positive start value"
    if end_value is None or end_value < 0:
        return None, False, "CAGR unavailable: invalid end value"
    years = (end_date - start_date).days / DAYS_PER_YEAR
    if years < 1:
        return (
            end_value / start_value - 1.0,
            False,
            "CAGR unavailable for <1 year of history: showing plain period return",
        )
    return (end_value / start_value) ** (1.0 / years) - 1.0, True, None


def max_drawdown(
    prices: list[float], dates: list[date]
) -> tuple[float, date | None, date | None]:
    """Running-peak drawdown. Returns (max_dd <= 0, peak_date, trough_date)."""
    if not prices:
        return 0.0, None, None
    peak = prices[0]
    peak_idx = 0
    worst = 0.0
    worst_peak_idx = 0
    worst_trough_idx = 0
    for i, price in enumerate(prices):
        if price > peak:
            peak = price
            peak_idx = i
        dd = price / peak - 1.0 if peak > 0 else 0.0
        if dd < worst:
            worst = dd
            worst_peak_idx = peak_idx
            worst_trough_idx = i
    peak_date = dates[worst_peak_idx] if dates else None
    trough_date = dates[worst_trough_idx] if dates else None
    return worst, peak_date, trough_date


def sharpe_ratio(
    prices: list[float],
    dates: list[date],
    rf: float = 0.0526,
    freq: str = "daily",
) -> tuple[float | None, str | None]:
    """Annualized Sharpe. Needs >= 1yr daily data, else (None, warning).

    Zero volatility with positive mean excess -> +inf is meaningless here;
    constant series returns 0.0 (no excess risk, no reward signal).
    """
    if freq == "daily" and len(prices) >= 2 and dates:
        span_years = (dates[-1] - dates[0]).days / DAYS_PER_YEAR
        if span_years < 1:
            return None, (
                "Sharpe unavailable: needs >= 1 year of daily data"
            )
    rets = np.asarray(period_returns(prices), dtype=float)
    if rets.size < 2:
        return None, "Sharpe unavailable: insufficient return observations"
    daily_rf = rf / TRADING_DAYS
    excess = rets - daily_rf
    std = float(np.std(rets, ddof=1))  # ddof=1 locked
    if math.isnan(std) or std == 0.0:
        return 0.0, None
    return float(np.mean(excess) * TRADING_DAYS / (std * math.sqrt(TRADING_DAYS))), None
