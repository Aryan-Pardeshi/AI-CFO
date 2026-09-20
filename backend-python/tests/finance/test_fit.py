"""Unit tests for pure Python portfolio fit calculations."""

import pytest
from finance.fit import calculate_portfolio_fit


@pytest.fixture
def base_user():
    return {
        "user_id": "test-sub",
        "risk_profile": "MODERATE",
        "investment_horizon_years": 5,
        "strategy_goal": "WEALTH_GROWTH",
    }


@pytest.fixture
def base_stock():
    return {
        "instrument_key": "NSE_EQ|INE002A01018",
        "symbol": "RELIANCE",
        "name": "Reliance Industries Ltd.",
        "asset_type": "STOCK",
        "sector": "ENERGY",
    }


@pytest.fixture
def base_etf():
    return {
        "instrument_key": "NSE_EQ|INF732E01015",
        "symbol": "NIFTYBEES",
        "name": "Nippon India ETF Nifty BeES",
        "asset_type": "ETF",
        "sector": "INDEX",
    }


@pytest.fixture
def debt_etf():
    return {
        "instrument_key": "NSE_EQ|INF732E01037",
        "symbol": "LIQUIDBEES",
        "name": "Nippon India ETF Liquid BeES",
        "asset_type": "ETF",
        "sector": "DEBT",
        "risk_category": "CONSERVATIVE",
    }


@pytest.fixture
def base_quote():
    return {
        "last_price_paise": 298000,
        "day_change_paise": 1250,
        "day_change_pct": 0.42,
    }


def test_invalid_or_negative_amount_returns_insufficient_data(base_user, base_stock, base_quote):
    res = calculate_portfolio_fit(
        user_profile=base_user,
        holdings=[],
        security=base_stock,
        add_amount_paise=-500,
        quote=base_quote,
    )
    assert res["assessment"] == "INSUFFICIENT_DATA"
    assert "add_amount_paise" in res["warnings"][0]

    res_zero = calculate_portfolio_fit(
        user_profile=base_user,
        holdings=[],
        security=base_stock,
        add_amount_paise=0,
        quote=base_quote,
    )
    assert res_zero["assessment"] == "INSUFFICIENT_DATA"


def test_missing_profile_returns_insufficient_data(base_stock, base_quote):
    res = calculate_portfolio_fit(
        user_profile=None,
        holdings=[],
        security=base_stock,
        add_amount_paise=1000000,
        quote=base_quote,
    )
    assert res["assessment"] == "INSUFFICIENT_DATA"
    assert "User profile not found" in res["warnings"][0]


def test_missing_quote_returns_insufficient_data(base_user, base_stock):
    res = calculate_portfolio_fit(
        user_profile=base_user,
        holdings=[],
        security=base_stock,
        add_amount_paise=1000000,
        quote=None,
    )
    assert res["assessment"] == "INSUFFICIENT_DATA"
    assert "Live quote is unavailable" in res["warnings"][0]


def test_stock_concentration_boundary_24_99_pct(base_user, base_stock, base_quote):
    # Total portfolio after: 10,000,000 paise (₹100,000)
    # Stock projected: 2,499,000 paise -> 24.99% (2499 bps)
    # Holdings before: other holdings = 7,501,000 paise
    # Add amount: 2,499,000 paise
    holdings = [
        {"holding_id": "h1", "symbol": "TCS", "asset_type": "STOCK", "value_paise": 7501000, "sector": "IT"}
    ]
    res = calculate_portfolio_fit(
        user_profile=base_user,
        holdings=holdings,
        security=base_stock,
        add_amount_paise=2499000,
        quote=base_quote,
    )
    conc_factor = next(f for f in res["factors"] if f["key"] == "concentration")
    assert conc_factor["status"] == "ALIGNS"
    assert res["allocation"]["projected_weight_bps"] == 2499
    assert res["assessment"] == "POTENTIAL_FIT"


def test_stock_concentration_boundary_25_00_pct(base_user, base_stock, base_quote):
    # Total portfolio after: 10,000,000 paise (₹100,000)
    # Stock projected: 2,500,000 paise -> 25.00% (2500 bps)
    # Holdings before: other holdings = 7,500,000 paise
    # Add amount: 2,500,000 paise
    holdings = [
        {"holding_id": "h1", "symbol": "TCS", "asset_type": "STOCK", "value_paise": 7500000, "sector": "IT"}
    ]
    res = calculate_portfolio_fit(
        user_profile=base_user,
        holdings=holdings,
        security=base_stock,
        add_amount_paise=2500000,
        quote=base_quote,
    )
    conc_factor = next(f for f in res["factors"] if f["key"] == "concentration")
    assert conc_factor["status"] == "ALIGNS"
    assert res["allocation"]["projected_weight_bps"] == 2500
    assert res["assessment"] == "POTENTIAL_FIT"


def test_stock_concentration_boundary_25_01_pct(base_user, base_stock, base_quote):
    # Total portfolio after: 10,000,000 paise (₹100,000)
    # Stock projected: 2,501,000 paise -> 25.01% (2501 bps)
    # Holdings before: other holdings = 7,499,000 paise
    # Add amount: 2,501,000 paise
    holdings = [
        {"holding_id": "h1", "symbol": "TCS", "asset_type": "STOCK", "value_paise": 7499000, "sector": "IT"}
    ]
    res = calculate_portfolio_fit(
        user_profile=base_user,
        holdings=holdings,
        security=base_stock,
        add_amount_paise=2501000,
        quote=base_quote,
    )
    conc_factor = next(f for f in res["factors"] if f["key"] == "concentration")
    assert conc_factor["status"] == "CAUTION"
    assert res["allocation"]["projected_weight_bps"] == 2501
    assert res["assessment"] == "NEEDS_REVIEW"


def test_etf_concentration_above_25_pct_is_not_single_stock_caution(base_user, base_etf, base_quote):
    # For ETFs, high allocation represents diversified underlying index, not single-stock risk
    res = calculate_portfolio_fit(
        user_profile=base_user,
        holdings=[],
        security=base_etf,
        add_amount_paise=1000000,
        quote=base_quote,
    )
    conc_factor = next(f for f in res["factors"] if f["key"] == "concentration")
    assert conc_factor["status"] == "ALIGNS"
    assert "ETF" in conc_factor["detail"]
    assert res["assessment"] == "POTENTIAL_FIT"


def test_conservative_profile_with_stock_yields_caution(base_stock, base_quote):
    user = {
        "user_id": "u1",
        "risk_profile": "CONSERVATIVE",
        "investment_horizon_years": 5,
    }
    holdings = [
        {"holding_id": "h1", "symbol": "FD", "asset_type": "FD", "value_paise": 10000000}
    ]
    res = calculate_portfolio_fit(
        user_profile=user,
        holdings=holdings,
        security=base_stock,
        add_amount_paise=500000,
        quote=base_quote,
    )
    risk_factor = next(f for f in res["factors"] if f["key"] == "risk_profile")
    assert risk_factor["status"] == "CAUTION"
    assert res["assessment"] == "NEEDS_REVIEW"


def test_conservative_profile_with_unverified_etf_returns_insufficient_data(base_etf, base_quote):
    # NIFTYBEES has no explicit debt/conservative classification -> returns INSUFFICIENT_DATA, not "fits"
    user = {
        "user_id": "u1",
        "risk_profile": "CONSERVATIVE",
        "investment_horizon_years": 5,
    }
    holdings = [
        {"holding_id": "h1", "symbol": "FD", "asset_type": "FD", "value_paise": 10000000}
    ]
    res = calculate_portfolio_fit(
        user_profile=user,
        holdings=holdings,
        security=base_etf,
        add_amount_paise=500000,
        quote=base_quote,
    )
    risk_factor = next(f for f in res["factors"] if f["key"] == "risk_profile")
    assert risk_factor["status"] == "INSUFFICIENT_DATA"
    assert res["assessment"] == "INSUFFICIENT_DATA"
    assert "not verified" in risk_factor["detail"].lower()


def test_conservative_profile_with_verified_debt_etf_aligns(debt_etf, base_quote):
    # LIQUIDBEES has risk_category: "CONSERVATIVE" and sector: "DEBT" -> aligns
    user = {
        "user_id": "u1",
        "risk_profile": "CONSERVATIVE",
        "investment_horizon_years": 5,
    }
    holdings = [
        {"holding_id": "h1", "symbol": "FD", "asset_type": "FD", "value_paise": 10000000}
    ]
    res = calculate_portfolio_fit(
        user_profile=user,
        holdings=holdings,
        security=debt_etf,
        add_amount_paise=500000,
        quote=base_quote,
    )
    risk_factor = next(f for f in res["factors"] if f["key"] == "risk_profile")
    assert risk_factor["status"] == "ALIGNS"
    assert res["assessment"] == "POTENTIAL_FIT"


def test_sector_exposure_shown_informationally_without_arbitrary_threshold(base_user, base_stock, base_quote):
    # Portfolio with 45% in ENERGY sector already; adding more reaches 55%
    # Must NOT trigger CAUTION based on an arbitrary 40% threshold; must be INFO
    holdings = [
        {"holding_id": "h1", "symbol": "ONGC", "asset_type": "STOCK", "value_paise": 4500000, "sector": "ENERGY"},
        {"holding_id": "h2", "symbol": "TCS", "asset_type": "STOCK", "value_paise": 5500000, "sector": "IT"},
    ]
    # Total before: 10M paise. Add 2M paise to RELIANCE (ENERGY).
    # Total after: 12M paise. Energy projected: 6.5M paise = 54.17%.
    # RELIANCE weight: 2M / 12M = 16.67% (within 25% single-stock limit).
    res = calculate_portfolio_fit(
        user_profile=base_user,
        holdings=holdings,
        security=base_stock,
        add_amount_paise=2000000,
        quote=base_quote,
    )
    sec_factor = next(f for f in res["factors"] if f["key"] == "diversification")
    assert sec_factor["status"] == "INFO"
    assert "Adjusts your existing ENERGY exposure" in sec_factor["detail"]
    # Sector does not cause CAUTION or NEEDS_REVIEW
    assert res["assessment"] == "POTENTIAL_FIT"


def test_short_investment_horizon_yields_caution(base_user, base_stock, base_quote):
    user = {**base_user, "investment_horizon_years": 1}
    holdings = [
        {"holding_id": "h1", "symbol": "TCS", "asset_type": "STOCK", "value_paise": 10000000, "sector": "IT"}
    ]
    res = calculate_portfolio_fit(
        user_profile=user,
        holdings=holdings,
        security=base_stock,
        add_amount_paise=500000,
        quote=base_quote,
    )
    horizon_factor = next(f for f in res["factors"] if f["key"] == "investment_horizon")
    assert horizon_factor["status"] == "CAUTION"
    assert res["assessment"] == "NEEDS_REVIEW"


def test_cash_excluded_and_fd_included_in_denominator(base_user, base_stock, base_quote):
    holdings = [
        {"holding_id": "h1", "symbol": "CASH", "asset_type": "CASH", "value_paise": 5000000},
        {"holding_id": "h2", "symbol": "HDFC FD", "asset_type": "FD", "value_paise": 2000000},
        {"holding_id": "h3", "symbol": "INFY", "asset_type": "STOCK", "value_paise": 1000000, "sector": "IT"},
    ]
    # Total portfolio before: FD (2M) + INFY (1M) = 3M paise (cash 5M excluded)
    res = calculate_portfolio_fit(
        user_profile=base_user,
        holdings=holdings,
        security=base_stock,
        add_amount_paise=1000000,
        quote=base_quote,
    )
    assert res["inputs"]["portfolio_value_before_paise"] == 3000000
    assert res["inputs"]["portfolio_value_after_paise"] == 4000000
    assert res["allocation"]["projected_weight_bps"] == 2500  # 1M / 4M = 25.00%
