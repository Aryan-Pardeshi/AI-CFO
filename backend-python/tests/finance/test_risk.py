"""Tests for finance/risk.py — portfolio volatility via covariance."""

import math
import os
import sys
from datetime import date, timedelta

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from finance.risk import portfolio_volatility

BASE = date(2023, 1, 2)


def _series(prices, start=BASE, step_days=1):
    return [(start + timedelta(days=i * step_days), p)
            for i, p in enumerate(prices)]


def _gbm_prices(n, start_price, daily_drift, shock_pattern):
    prices = [start_price]
    for i in range(1, n):
        shock = shock_pattern[(i - 1) % len(shock_pattern)]
        prices.append(prices[-1] * (1 + daily_drift + shock))
    return prices


def test_two_asset_covariance_known_inputs():
    # Hand-computed: equal weights, known daily returns.
    # A returns: [0.01, -0.01, 0.01, -0.01]; B returns: [0.02, 0.0, 0.02, 0.0]
    a = [100.0, 101.0, 99.99, 100.9899, 99.980001]
    b = [100.0, 102.0, 102.0, 104.04, 104.04]
    result = portfolio_volatility(
        {"A": _series(a), "B": _series(b)},
        {"A": 0.5, "B": 0.5},
        min_aligned_days=4,  # 120-day gate covered by its own test below
    )
    assert result["ok"] is True
    import numpy as np

    ra = np.array([0.01, -0.01, 0.01, -0.01])
    # actual returns from price ladders above:
    from finance.returns import period_returns

    ra = np.array(period_returns(a))
    rb = np.array(period_returns(b))
    cov = np.cov(np.vstack([ra, rb]), ddof=1)
    w = np.array([0.5, 0.5])
    expected = math.sqrt(252 * float(w @ cov @ w))
    assert result["annualized_volatility"] == pytest.approx(expected, rel=1e-9)


def test_correlated_pair_hotter_than_uncorrelated():
    # Same individual vols; perfectly-correlated pair must show higher
    # portfolio vol than uncorrelated pair — proves covariance, not averaging.
    n = 200
    shocks = [0.01, -0.012, 0.008, -0.006, 0.011, -0.009] * 40
    a = _gbm_prices(n, 100.0, 0.0, shocks)
    b_same = _gbm_prices(n, 50.0, 0.0, shocks)  # identical shocks
    b_flip = _gbm_prices(
        n, 50.0, 0.0, [-s for s in shocks]
    )  # mirrored shocks
    corr = portfolio_volatility(
        {"A": _series(a), "B": _series(b_same)}, {"A": 0.5, "B": 0.5}
    )
    uncorr = portfolio_volatility(
        {"A": _series(a), "B": _series(b_flip)}, {"A": 0.5, "B": 0.5}
    )
    assert corr["ok"] and uncorr["ok"]
    assert corr["annualized_volatility"] > uncorr["annualized_volatility"]
    # naive average would give the same answer for both — must differ
    assert abs(corr["annualized_volatility"]
               - uncorr["annualized_volatility"]) > 1e-6


def test_under_120_days_insufficient_data():
    a = _series([100.0 + i * 0.1 for i in range(50)])
    b = _series([50.0 + i * 0.05 for i in range(50)])
    result = portfolio_volatility({"A": a, "B": b}, {"A": 0.5, "B": 0.5})
    assert result["ok"] is False
    assert result["code"] == "INSUFFICIENT_DATA"
    assert result["aligned_days"] == 50


def test_inner_join_mismatched_dates():
    # MF NAV dates (sparse) vs stock dates (dense) — inner join, not ffill.
    stock = _series([100.0 + i * 0.3 for i in range(200)], step_days=1)
    mf = _series([10.0 + i * 0.05 for i in range(150)], start=BASE,
                 step_days=1)
    # shift MF window so only partial overlap
    mf = [(d + timedelta(days=30), p) for d, p in mf]
    result = portfolio_volatility({"S": stock, "M": mf},
                                  {"S": 0.6, "M": 0.4})
    assert result["ok"] is True
    assert result["aligned_days"] == 150
