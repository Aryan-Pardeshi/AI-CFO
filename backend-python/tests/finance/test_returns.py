"""Tests for finance/returns.py — returns, volatility, CAGR, drawdown, Sharpe."""

import math
import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from finance.returns import (
    annualized_volatility,
    cagr,
    max_drawdown,
    period_returns,
    sharpe_ratio,
    volatility_from_prices,
)


def test_period_returns():
    assert period_returns([100.0, 110.0, 99.0]) == pytest.approx(
        [0.10, -0.10], rel=1e-9
    )


def test_constant_price_series_zero_vol_no_nan():
    result = volatility_from_prices([100.0] * 30, freq="daily")
    assert result == 0.0
    assert not math.isnan(result)


def test_ddof1_hand_computed():
    # prices -> returns [0.01, -0.005, 0.02, -0.01]
    # sample std (ddof=1) of those returns, annualized daily
    prices = [100.0, 101.0, 100.495, 102.5049, 101.479851]
    rets = period_returns(prices)
    mean = sum(rets) / len(rets)
    sample_var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    expected = math.sqrt(sample_var) * math.sqrt(252)
    assert volatility_from_prices(prices, freq="daily") == pytest.approx(
        expected, rel=1e-9
    )


def test_ddof1_differs_from_ddof0():
    # Guard: implementation must use sample std. ddof=0 would give a
    # different (smaller) number on this series — test pins ddof=1.
    import numpy as np

    prices = [100.0, 103.0, 98.0, 105.0, 101.0, 108.0]
    got = volatility_from_prices(prices, freq="daily")
    rets = np.array(period_returns(prices))
    pop = float(np.std(rets, ddof=0)) * math.sqrt(252)
    samp = float(np.std(rets, ddof=1)) * math.sqrt(252)
    assert got == pytest.approx(samp, rel=1e-12)
    assert got != pytest.approx(pop, rel=1e-6)


def test_daily_uses_sqrt252_monthly_sqrt12():
    rets = [0.01, -0.005, 0.02]
    assert annualized_volatility(rets, freq="daily") == pytest.approx(
        annualized_volatility(rets, freq="monthly")
        / math.sqrt(12)
        * math.sqrt(252),
        rel=1e-12,
    )
    assert annualized_volatility(rets, freq="monthly") == pytest.approx(
        __import__("numpy").std(rets, ddof=1) * math.sqrt(12), rel=1e-12
    )


def test_pct_change_nans_dropped():
    # leading None must not propagate — same result as clean series
    clean = volatility_from_prices([100.0, 101.0, 102.0, 101.5], freq="daily")
    with_none = volatility_from_prices(
        [None, 100.0, 101.0, 102.0, 101.5], freq="daily"
    )
    assert with_none == pytest.approx(clean, rel=1e-12)


def test_cagr_known_value():
    # 100 -> 200 over exactly 4 years (1461 days incl. leap) ~ 18.9%
    start = date(2020, 1, 1)
    end = date(2024, 1, 1)
    years = (end - start).days / 365.25
    expected = (200 / 100) ** (1 / years) - 1
    value, annualized, warning = cagr(100.0, 200.0, start, end)
    assert value == pytest.approx(expected, rel=1e-9)
    assert annualized is True
    assert warning is None


def test_cagr_non_positive_start_no_crash():
    value, annualized, warning = cagr(0.0, 200.0, date(2020, 1, 1),
                                      date(2024, 1, 1))
    assert value is None
    assert warning is not None


def test_cagr_sub_one_year_plain_return():
    value, annualized, warning = cagr(100.0, 110.0, date(2024, 1, 1),
                                      date(2024, 7, 1))
    assert value == pytest.approx(0.10, rel=1e-9)
    assert annualized is False
    assert warning is not None


def test_drawdown_rising_series_zero():
    dd, peak, trough = max_drawdown(
        [100.0, 101.0, 102.0, 103.0],
        [date(2024, 1, 1), date(2024, 1, 2), date(2024, 1, 3),
         date(2024, 1, 4)],
    )
    assert dd == 0.0
    assert peak is not None and trough is not None


def test_drawdown_known_peak_trough():
    prices = [100.0, 120.0, 90.0, 110.0]
    dates = [date(2024, 1, 1), date(2024, 1, 2), date(2024, 1, 3),
             date(2024, 1, 4)]
    dd, peak, trough = max_drawdown(prices, dates)
    assert dd == pytest.approx(90 / 120 - 1, rel=1e-9)  # -25%
    assert peak == date(2024, 1, 2)
    assert trough == date(2024, 1, 3)


def test_sharpe_needs_one_year_daily():
    # < 1yr of daily data -> omitted with warning
    prices = [100.0 + i * 0.1 for i in range(100)]
    dates = [date(2024, 1, 1)] * 100  # placeholder, replaced below
    from datetime import timedelta

    base = date(2024, 1, 1)
    dates = [base + timedelta(days=i) for i in range(100)]
    value, warning = sharpe_ratio(prices, dates)
    assert value is None
    assert warning is not None


def test_sharpe_known_value():
    from datetime import timedelta

    base = date(2023, 1, 1)
    dates = [base + timedelta(days=i) for i in range(400)]
    prices = [100.0]
    for i in range(1, 400):
        prices.append(prices[-1] * (1 + 0.001 if i % 2 else 0.9995))
    value, warning = sharpe_ratio(prices, dates, rf=0.0526)
    assert warning is None
    assert value is not None and not math.isnan(value)
