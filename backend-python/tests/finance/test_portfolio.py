"""Tests for finance/portfolio.py — holdings value, weights, concentration.

Locked rule: STOCK/CRYPTO weight > 25 (strict) -> warning;
ETF/MUTUAL_FUND > 25 -> info; FD/CASH never flagged.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from finance.portfolio import (
    allocation_by,
    analyze_portfolio,
    concentration_flags,
    holding_pnl,
)


def _holding(**kw):
    base = {"holding_id": "h1", "symbol": "X", "asset_type": "STOCK",
            "quantity": 10, "price_paise": 10000, "value_paise": 100000,
            "avg_buy_price_paise": 9000}
    base.update(kw)
    return base


def test_weights_sum_to_100():
    holdings = [_holding(holding_id="a", value_paise=60000),
                _holding(holding_id="b", value_paise=40000)]
    result = analyze_portfolio(holdings)
    total = sum(h["weight_pct"] for h in result["holdings"])
    assert total == 100.0


def test_concentration_24_99_no_flag():
    # 2499 / 10000 = 24.99% -> no flag
    holdings = [_holding(holding_id="big", symbol="BIG", value_paise=2499),
                _holding(holding_id="rest", symbol="REST", asset_type="FD",
                         value_paise=7501, avg_buy_price_paise=None)]
    flags = concentration_flags(analyze_portfolio(holdings)["holdings"])
    assert flags == []


def test_concentration_exactly_25_no_flag():
    holdings = [_holding(holding_id="big", symbol="BIG", value_paise=2500),
                _holding(holding_id="rest", symbol="REST", asset_type="FD",
                         value_paise=7500, avg_buy_price_paise=None)]
    result = analyze_portfolio(holdings)
    big = [h for h in result["holdings"] if h["holding_id"] == "big"][0]
    assert big["weight_pct"] == 25.0
    assert concentration_flags(result["holdings"]) == []


def test_concentration_25_01_stock_warns():
    holdings = [_holding(holding_id="big", symbol="BIG", value_paise=2501),
                _holding(holding_id="rest", symbol="REST", asset_type="FD",
                         value_paise=7499, avg_buy_price_paise=None)]
    flags = concentration_flags(analyze_portfolio(holdings)["holdings"])
    assert len(flags) == 1
    assert flags[0]["severity"] == "warning"
    assert flags[0]["symbol"] == "BIG"
    assert flags[0]["threshold_pct"] == 25.0


def test_concentration_25_01_crypto_warns_etf_info():
    holdings = [_holding(holding_id="c", symbol="C", asset_type="CRYPTO",
                         value_paise=2501),
                _holding(holding_id="e", symbol="E", asset_type="ETF",
                         value_paise=2501),
                _holding(holding_id="r", symbol="R", asset_type="FD",
                         value_paise=4998, avg_buy_price_paise=None)]
    flags = concentration_flags(analyze_portfolio(holdings)["holdings"])
    by_symbol = {f["symbol"]: f["severity"] for f in flags}
    assert by_symbol["C"] == "warning"
    assert by_symbol["E"] == "info"


def test_concentration_mutual_fund_info_fd_never():
    holdings = [_holding(holding_id="m", symbol="M", asset_type="MUTUAL_FUND",
                         value_paise=3000),
                _holding(holding_id="f", symbol="F", asset_type="FD",
                         value_paise=7000, avg_buy_price_paise=None)]
    flags = concentration_flags(analyze_portfolio(holdings)["holdings"])
    assert len(flags) == 1
    assert flags[0]["severity"] == "info"
    # FD at 70% must never be flagged
    assert all(f["symbol"] != "F" for f in flags)


def test_denominator_includes_fd_excludes_cash():
    holdings = [_holding(holding_id="s", symbol="S", value_paise=50000),
                _holding(holding_id="f", symbol="F", asset_type="FD",
                         value_paise=50000, avg_buy_price_paise=None),
                _holding(holding_id="c", symbol="C", asset_type="CASH",
                         value_paise=1000000, avg_buy_price_paise=None)]
    result = analyze_portfolio(holdings)
    assert result["total_value_paise"] == 100000
    by_id = {h["holding_id"]: h for h in result["holdings"]}
    assert by_id["s"]["weight_pct"] == 50.0


def test_pnl_skipped_without_cost_basis():
    assert holding_pnl(100000, 10, None) is None
    pnl = holding_pnl(100000, 10, 9000)
    assert pnl["pnl_paise"] == 10000
    assert pnl["pnl_pct"] == pytest.approx(100 / 9)


def test_allocation_by_asset_type_and_sector():
    holdings = [_holding(holding_id="a", asset_type="STOCK", sector="ENERGY",
                         value_paise=60000),
                _holding(holding_id="b", asset_type="STOCK", sector="BANK",
                         value_paise=40000)]
    by_type = allocation_by(holdings, "asset_type", 100000)
    assert by_type == [{"key": "STOCK", "value_paise": 100000,
                        "weight_pct": 100.0}]
    by_sector = allocation_by(holdings, "sector", 100000)
    assert {e["key"]: e["weight_pct"] for e in by_sector} == {
        "ENERGY": 60.0, "BANK": 40.0}


def test_empty_portfolio():
    result = analyze_portfolio([])
    assert result["total_value_paise"] == 0
    assert result["holdings"] == []
    assert result["flags"] == []
