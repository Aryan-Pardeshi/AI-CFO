"""Tests for finance/shortterm.py â€” rolling-window historical analysis."""

import pytest

from finance.shortterm import analyze_short_term_fit


def test_short_term_analysis_uses_each_rolling_horizon_window():
    result = analyze_short_term_fit(
        price_history=[100, 110, 99, 120, 108],
        horizon_months=2,
    )

    assert result["status"] == "OK"
    assert result["windows_analyzed"] == 3
    assert result["worst_return_pct"] == pytest.approx(-1.0)
    assert result["median_return_pct"] == pytest.approx(9.090909, rel=1e-6)
    assert result["best_return_pct"] == pytest.approx(9.090909, rel=1e-6)
    assert result["loss_window_pct"] == pytest.approx(100 / 3)
    assert result["max_drawdown_pct"] == pytest.approx(-10.0)
    assert "20% STCG" in result["tax_rate_note"]
    assert "debt mutual funds" in result["tax_rate_note"]
    assert all("buy" not in value.lower() and "sell" not in value.lower()
               for value in result.values() if isinstance(value, str))


def test_short_term_analysis_returns_insufficient_data_without_fabrication():
    result = analyze_short_term_fit(price_history=[100, 105], horizon_months=2)

    assert result["status"] == "INSUFFICIENT_DATA"
    assert result["windows_analyzed"] == 0
    assert result["worst_return_pct"] is None
    assert result["median_return_pct"] is None
    assert result["best_return_pct"] is None
    assert result["max_drawdown_pct"] is None
    assert result["warnings"]
    assert "insufficient" in result["warnings"][0].lower()

