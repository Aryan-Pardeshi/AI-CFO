"""Tests for /securities/* endpoints in finance handler."""

import json
import os
import sys
from unittest.mock import MagicMock
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import handlers.finance as fin
from integrations import upstox


def _event(method, path, sub="user-123", body=None, query=None):
    event = {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {"jwt": {"claims": {"sub": sub}}},
        },
    }
    if body is not None:
        event["body"] = json.dumps(body) if isinstance(body, dict) else body
    if query is not None:
        event["queryStringParameters"] = query
    return event


DEMO_USER_DATA = {
    "user": {
        "user_id": "user-123",
        "name": "Demo User",
        "date_of_birth": "1995-01-01",
        "monthly_expenses_paise": 5000000,
        "monthly_investment_paise": 5000000,
        "cash_balance_paise": 20000000,
        "risk_profile": "MODERATE",
        "investment_horizon_years": 5,
        "strategy_goal": "WEALTH_GROWTH",
    },
    "holdings": [
        {
            "holding_id": "h-rel",
            "asset_type": "STOCK",
            "symbol": "RELIANCE",
            "instrument_key": "NSE_EQ|INE002A01018",
            "name": "Reliance Industries Ltd.",
            "quantity": 10,
            "avg_buy_price_paise": 250000,
            "manual_current_value_paise": 2980000,
            "sector": "ENERGY",
        },
        {
            "holding_id": "h-fd",
            "asset_type": "FD",
            "name": "HDFC FD",
            "fd_principal_paise": 5000000,
            "fd_annual_rate": 0.07,
            "fd_start_date": "2025-01-01",
        },
    ],
    "goals": [],
    "loans": [],
}

# Labeled test fixtures for market quotes and candles (injected by tests only)
FIXTURE_QUOTES = {
    "NSE_EQ|INE002A01018": {
        "last_price_paise": 298000,
        "change_paise": 1250,
        "change_pct": 0.42,
        "day_change_paise": 1250,
        "day_change_pct": 0.42,
        "open_paise": 296500,
        "high_paise": 299000,
        "low_paise": 295500,
        "prev_close_paise": 296750,
        "volume": 4521000,
        "as_of": "2026-09-20T10:00:00Z",
    },
    "NSE_EQ|INE009A01021": {
        "last_price_paise": 162000,
        "change_paise": -1500,
        "change_pct": -0.92,
        "day_change_paise": -1500,
        "day_change_pct": -0.92,
        "open_paise": 163000,
        "high_paise": 164000,
        "low_paise": 161500,
        "prev_close_paise": 163500,
        "volume": 3200000,
        "as_of": "2026-09-20T10:00:00Z",
    },
    "NSE_EQ|INF732E01015": {
        "last_price_paise": 25800,
        "change_paise": 120,
        "change_pct": 0.47,
        "day_change_paise": 120,
        "day_change_pct": 0.47,
        "open_paise": 25700,
        "high_paise": 25900,
        "low_paise": 25650,
        "prev_close_paise": 25680,
        "volume": 850000,
        "as_of": "2026-09-20T10:00:00Z",
    },
}

FIXTURE_CANDLES_RAW = {
    "status": "success",
    "data": {
        "candles": [
            ["2026-09-19T00:00:00+05:30", 2965.0, 2990.0, 2955.0, 2980.0, 4521000, 0],
            ["2026-09-18T00:00:00+05:30", 2950.0, 2975.0, 2940.0, 2967.5, 4100000, 0],
            ["2026-09-17T00:00:00+05:30", 2930.0, 2960.0, 2920.0, 2950.0, 3900000, 0],
        ]
    }
}


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setattr(fin, "load_user_data", lambda user_id: DEMO_USER_DATA)
    # By default in test suite, inject test fixtures
    monkeypatch.setattr(upstox, "_load_upstox_token", lambda *args, **kwargs: "test-token-xyz")
    monkeypatch.setattr(upstox, "_fetch_upstox_quotes", lambda keys, token: {k: FIXTURE_QUOTES[k] for k in keys if k in FIXTURE_QUOTES})


@pytest.mark.parametrize("path,query", [
    ("/securities/search", {"q": "RELIANCE"}),
    ("/securities/detail", {"instrument_key": "NSE_EQ|INE002A01018"}),
    ("/securities/history", {"instrument_key": "NSE_EQ|INE002A01018", "period": "1y"}),
    ("/securities/fit", {"instrument_key": "NSE_EQ|INE002A01018", "add_amount_paise": "1000000"}),
])
def test_securities_routes_reject_missing_jwt(path, query):
    event = {
        "requestContext": {"http": {"method": "GET", "path": path}},
        "queryStringParameters": query,
    }
    res = fin.handler(event, None)
    assert res["statusCode"] == 401
    assert json.loads(res["body"])["error"]["code"] == "UNAUTHORIZED"


# ---------------- Search Tests ----------------

def test_search_requires_non_empty_q():
    res = fin.handler(_event("GET", "/securities/search", query={}), None)
    assert res["statusCode"] == 400
    assert json.loads(res["body"])["error"]["code"] == "VALIDATION_ERROR"

    res_empty = fin.handler(_event("GET", "/securities/search", query={"q": "   "}), None)
    assert res_empty["statusCode"] == 400


def test_search_returns_normalized_results():
    res = fin.handler(_event("GET", "/securities/search", query={"q": "RELIANCE"}), None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert "results" in body
    assert len(body["results"]) > 0
    top = body["results"][0]
    assert top["symbol"] == "RELIANCE"
    assert top["instrument_key"] == "NSE_EQ|INE002A01018"
    assert top["asset_type"] == "STOCK"
    assert top["exchange"] == "NSE"
    assert top["price_paise"] == 298000
    assert top["change_paise"] == 1250
    assert top["change_pct"] == 0.42


def test_search_etf_query():
    res = fin.handler(_event("GET", "/securities/search", query={"q": "BEES"}), None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert any(r["asset_type"] == "ETF" for r in body["results"])


# ---------------- Detail Tests (Exact Contract Agreement) ----------------

def test_detail_requires_instrument_key():
    res = fin.handler(_event("GET", "/securities/detail", query={}), None)
    assert res["statusCode"] == 400
    assert json.loads(res["body"])["error"]["code"] == "VALIDATION_ERROR"


def test_detail_unknown_key_returns_404():
    res = fin.handler(_event("GET", "/securities/detail", query={"instrument_key": "UNKNOWN|KEY"}), None)
    assert res["statusCode"] == 404
    assert json.loads(res["body"])["error"]["code"] == "NOT_FOUND"


def test_detail_returns_exact_contract_shape_with_holding_when_owned():
    res = fin.handler(_event("GET", "/securities/detail", query={"instrument_key": "NSE_EQ|INE002A01018"}), None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])

    # Top-level contract keys
    assert set(body.keys()) == {
        "security", "quote", "holding", "performance", "fundamentals", "insights", "source", "as_of"
    }

    # Security object
    sec = body["security"]
    assert sec["instrument_key"] == "NSE_EQ|INE002A01018"
    assert sec["symbol"] == "RELIANCE"
    assert sec["name"] == "Reliance Industries Ltd."
    assert sec["asset_type"] == "STOCK"
    assert sec["exchange"] == "NSE"
    assert sec["isin"] == "INE002A01018"
    assert sec["sector"] == "ENERGY"

    # Quote object
    q = body["quote"]
    assert q["last_price_paise"] == 298000
    assert q["change_paise"] == 1250
    assert q["change_pct"] == 0.42
    assert q["open_paise"] == 296500
    assert q["high_paise"] == 299000
    assert q["low_paise"] == 295500
    assert q["prev_close_paise"] == 296750
    assert q["volume"] == 4521000

    # Holding object (user owns RELIANCE in DEMO_USER_DATA)
    h = body["holding"]
    assert h is not None
    assert h["holding_id"] == "h-rel"
    assert h["symbol"] == "RELIANCE"
    assert h["quantity"] == 10
    assert h["avg_buy_price_paise"] == 250000
    assert h["invested_value_paise"] == 2500000
    assert h["current_value_paise"] == 2980000
    assert h["unrealized_pnl_paise"] == 480000
    assert h["unrealized_pnl_pct"] == 19.2

    # Performance object
    p = body["performance"]
    assert p["day_low_paise"] == 295500
    assert p["day_high_paise"] == 299000
    assert p["open_paise"] == 296500
    assert p["prev_close_paise"] == 296750
    assert p["volume"] == 4521000
    assert p["week_52_low_paise"] is None
    assert p["week_52_high_paise"] is None

    # Fundamentals object
    f = body["fundamentals"]
    assert "pe_ratio" in f
    assert "pb_ratio" in f

    # Insights and provenance
    assert isinstance(body["insights"], list)
    assert body["source"] == "UPSTOX"
    assert "as_of" in body


def test_detail_returns_none_holding_when_not_owned():
    res = fin.handler(_event("GET", "/securities/detail", query={"instrument_key": "NSE_EQ|INE009A01021"}), None)  # INFY
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["security"]["symbol"] == "INFY"
    assert body["holding"] is None


# ---------------- History Tests ----------------

def test_history_validates_period():
    res_bad = fin.handler(_event("GET", "/securities/history", query={
        "instrument_key": "NSE_EQ|INE002A01018",
        "period": "10y",
    }), None)
    assert res_bad["statusCode"] == 400
    assert json.loads(res_bad["body"])["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize("period", ["1d", "3d", "1m", "6m", "1y", "3y", "5y"])
def test_history_supports_all_contract_periods(period, monkeypatch):
    import urllib.request
    from io import BytesIO

    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(FIXTURE_CANDLES_RAW).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    monkeypatch.setattr(urllib.request, "urlopen", lambda *args, **kwargs: mock_resp)

    res = fin.handler(_event("GET", "/securities/history", query={
        "instrument_key": "NSE_EQ|INE002A01018",
        "period": period,
    }), None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["period"] == period
    assert isinstance(body["candles"], list)
    assert len(body["candles"]) == 3
    # Check chronological ordering: oldest first
    assert body["candles"][0]["date"] == "2026-09-17"
    assert body["candles"][-1]["date"] == "2026-09-19"
    # Close price in paise
    assert body["candles"][0]["close_paise"] == 295000
    assert body["candles"][-1]["close_paise"] == 298000


# ---------------- No Synthetic Data Outside Fixture Tests ----------------

def test_no_synthetic_detail_when_unconfigured(monkeypatch):
    # When no token is configured and no fixture is injected, must raise 502 UPSTREAM_UNAVAILABLE
    monkeypatch.setattr(upstox, "_load_upstox_token", lambda *args, **kwargs: None)
    upstox.reset_token_cache()

    res = fin.handler(_event("GET", "/securities/detail", query={"instrument_key": "NSE_EQ|INE002A01018"}), None)
    assert res["statusCode"] == 502
    assert json.loads(res["body"])["error"]["code"] == "UPSTREAM_UNAVAILABLE"


def test_no_synthetic_candles_when_unconfigured(monkeypatch):
    # When no token is configured and no fixture is injected, history must raise 502 UPSTREAM_UNAVAILABLE
    monkeypatch.setattr(upstox, "_load_upstox_token", lambda *args, **kwargs: None)
    upstox.reset_token_cache()

    res = fin.handler(_event("GET", "/securities/history", query={
        "instrument_key": "NSE_EQ|INE002A01018",
        "period": "1y",
    }), None)
    assert res["statusCode"] == 502
    assert json.loads(res["body"])["error"]["code"] == "UPSTREAM_UNAVAILABLE"


def test_upstream_error_on_network_failure(monkeypatch):
    # When Upstox API throws network error, returns 502 UPSTREAM_UNAVAILABLE
    monkeypatch.setattr(upstox, "_fetch_upstox_quotes", MagicMock(side_effect=upstox.SecurityUpstreamError("Connection refused")))

    res = fin.handler(_event("GET", "/securities/detail", query={"instrument_key": "NSE_EQ|INE002A01018"}), None)
    assert res["statusCode"] == 502
    assert json.loads(res["body"])["error"]["code"] == "UPSTREAM_UNAVAILABLE"


# ---------------- Portfolio Fit Tests ----------------

def test_fit_requires_valid_parameters():
    res_no_key = fin.handler(_event("GET", "/securities/fit", query={"add_amount_paise": "1000000"}), None)
    assert res_no_key["statusCode"] == 400

    res_no_amt = fin.handler(_event("GET", "/securities/fit", query={"instrument_key": "NSE_EQ|INE002A01018"}), None)
    assert res_no_amt["statusCode"] == 400

    res_neg_amt = fin.handler(_event("GET", "/securities/fit", query={
        "instrument_key": "NSE_EQ|INE002A01018",
        "add_amount_paise": "-500",
    }), None)
    assert res_neg_amt["statusCode"] == 400


def test_fit_uses_verified_sub_not_client_user_id(monkeypatch):
    seen = {}

    def spy_loader(user_id):
        seen["user_id"] = user_id
        return DEMO_USER_DATA

    monkeypatch.setattr(fin, "load_user_data", spy_loader)

    res = fin.handler(_event("GET", "/securities/fit", sub="verified-sub-456", query={
        "instrument_key": "NSE_EQ|INE002A01018",
        "add_amount_paise": "1000000",
        "user_id": "attacker-id",
    }), None)
    assert res["statusCode"] == 200
    assert seen["user_id"] == "verified-sub-456"


def test_fit_returns_transparent_assessment_shape():
    res = fin.handler(_event("GET", "/securities/fit", query={
        "instrument_key": "NSE_EQ|INE002A01018",
        "add_amount_paise": "1000000",
    }), None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["assessment"] in {"POTENTIAL_FIT", "NEEDS_REVIEW", "INSUFFICIENT_DATA"}
    assert "inputs" in body
    assert body["inputs"]["add_amount_paise"] == 1000000
    assert "allocation" in body
    assert "current_weight_bps" in body["allocation"]
    assert "projected_weight_bps" in body["allocation"]
    assert "factors" in body
    assert any(f["key"] == "risk_profile" for f in body["factors"])
    assert any(f["key"] == "concentration" for f in body["factors"])
    assert "source" in body
    assert "as_of" in body
