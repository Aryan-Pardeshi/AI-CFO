"""Handler-level tests — mocked DynamoDB loader, no AWS needed."""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import handlers.finance as fin


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


DEMO_DATA = {
    "user": {
        "user_id": "user-123",
        "name": "Demo",
        "date_of_birth": "1996-05-01",
        "monthly_expenses_paise": 5000000,
        "monthly_investment_paise": 5000000,
        "cash_balance_paise": 30000000,
        "declared_net_worth_paise": 1000000,
    },
    "holdings": [
        {
            "holding_id": "h1",
            "asset_type": "STOCK",
            "symbol": "RELIANCE",
            "name": "Reliance",
            "quantity": 10,
            "avg_buy_price_paise": 200000,
            "manual_current_value_paise": 3000000,
            "sector": "ENERGY",
        },
        {
            "holding_id": "h2",
            "asset_type": "FD",
            "symbol": None,
            "name": "HDFC FD",
            "fd_principal_paise": 10000000,
            "fd_annual_rate": 0.07,
            "fd_start_date": "2024-01-01",
        },
    ],
    "goals": [],
    "loans": [],
}


@pytest.fixture
def demo(monkeypatch):
    monkeypatch.setattr(fin, "load_user_data", lambda user_id: DEMO_DATA)
    return DEMO_DATA


@pytest.mark.parametrize("method,path,body", [
    ("GET", "/portfolio/analysis", None),
    ("POST", "/fire/calculate", {}),
    ("POST", "/fire/goal-impact",
     {"candidate_goal": {"goal_type": "CAR", "amount_today_paise": 50000000,
                         "target_age": 35}}),
    ("GET", "/net-worth", None),
    ("GET", "/net-worth/projection", None),
])
def test_five_routes_reject_missing_jwt(method, path, body):
    event = {"requestContext": {"http": {"method": method, "path": path}}}
    if body is not None:
        event["body"] = json.dumps(body)
    res = fin.handler(event, None)
    assert res["statusCode"] == 401
    assert json.loads(res["body"])["error"]["code"] == "UNAUTHORIZED"


def test_other_routes_still_501(demo):
    res = fin.handler(_event("GET", "/securities/search"), None)
    assert res["statusCode"] == 501
    assert json.loads(res["body"])["error"]["code"] == "NOT_IMPLEMENTED"


def test_portfolio_analysis_uses_holdings(demo):
    res = fin.handler(_event("GET", "/portfolio/analysis"), None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["total_value_paise"] > 3000000  # stock + FD accrued
    assert body["holdings"][0]["symbol"] == "RELIANCE"
    assert isinstance(body["warnings"], list)


def test_fire_calculate_returns_fire_age(demo):
    res = fin.handler(_event("POST", "/fire/calculate", body={}), None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["fire_age"] is not None
    assert body["assumptions"]["lifespan_age"] == 91


def test_fire_goal_impact_delta_non_negative(demo):
    res = fin.handler(
        _event("POST", "/fire/goal-impact", body={
            "candidate_goal": {"goal_type": "CAR",
                               "amount_today_paise": 50000000,
                               "target_age": 35}}),
        None,
    )
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["delta_years"] >= 0


def test_net_worth_source_holdings(demo):
    res = fin.handler(_event("GET", "/net-worth"), None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["source"] == "holdings"  # holdings exist -> wins over declared
    assert body["net_worth_paise"] == (
        body["total_assets_paise"] - body["total_liabilities_paise"])


def test_net_worth_projection_curve(demo):
    res = fin.handler(_event("GET", "/net-worth/projection"), None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert len(body["curve"]) > 5


def test_client_user_id_in_body_ignored(demo):
    # Attacker sends another user's id in the body — must have no effect.
    seen = {}

    def spy_loader(user_id):
        seen["user_id"] = user_id
        return DEMO_DATA

    import unittest.mock as mock

    with mock.patch.object(fin, "load_user_data", spy_loader):
        res = fin.handler(
            _event("POST", "/fire/calculate",
                   body={"user_id": "victim-999"}),
            None,
        )
    assert res["statusCode"] == 200
    assert seen["user_id"] == "user-123"


def test_missing_profile_returns_404(monkeypatch):
    monkeypatch.setattr(fin, "load_user_data",
                        lambda user_id: {"user": None, "holdings": [],
                                         "goals": [], "loans": []})
    res = fin.handler(_event("GET", "/net-worth"), None)
    assert res["statusCode"] == 404
    assert json.loads(res["body"])["error"]["code"] == "NOT_FOUND"


def test_dynamo_failure_returns_500(monkeypatch):
    def boom(user_id):
        raise RuntimeError("dynamo down")

    monkeypatch.setattr(fin, "load_user_data", boom)
    res = fin.handler(_event("GET", "/portfolio/analysis"), None)
    assert res["statusCode"] == 500
    assert json.loads(res["body"])["error"]["code"] == "INTERNAL"
