"""Handler-level tests — mocked DynamoDB loader, no AWS needed."""

import json
import os
import sys
from decimal import Decimal

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


# DynamoDB hands every number back as decimal.Decimal, so the fixtures above
# (plain ints) never exercised the types the routes actually receive.

DECIMAL_DATA = {
    "user": {
        "user_id": "user-123",
        "name": "Demo",
        "date_of_birth": "1996-05-01",
        "monthly_expenses_paise": Decimal("5000000"),
        "monthly_investment_paise": Decimal("5000000"),
        "cash_balance_paise": Decimal("30000000"),
        "emergency_fund_target_months": Decimal("6"),
    },
    "holdings": [
        {
            "holding_id": "h1",
            "asset_type": "STOCK",
            "symbol": "RELIANCE",
            "name": "Reliance Industries",
            "quantity": Decimal("30"),
            "avg_buy_price_paise": Decimal("1800000"),
        },
        {
            "holding_id": "h2",
            "asset_type": "MUTUAL_FUND",
            "symbol": "PPFCF",
            "name": "Parag Parikh Flexi Cap",
            "quantity": Decimal("12.5"),
            "avg_buy_price_paise": Decimal("20000"),
        },
        {
            "holding_id": "h3",
            "asset_type": "FD",
            "name": "Demo Fixed Deposit",
            "fd_type": "CUMULATIVE",
            "fd_principal_paise": Decimal("30000000"),
            "fd_annual_rate": Decimal("0.07"),
            "fd_start_date": "2026-01-15",
        },
    ],
    "goals": [],
    "loans": [],
}


@pytest.fixture
def decimal_demo(monkeypatch):
    monkeypatch.setattr(fin, "load_user_data",
                        lambda user_id: fin.plain_numbers(DECIMAL_DATA))
    return DECIMAL_DATA


@pytest.mark.parametrize("method,path,body", [
    ("GET", "/portfolio/analysis", None),
    ("POST", "/fire/calculate", {}),
    ("GET", "/net-worth", None),
    ("GET", "/net-worth/projection", None),
])
def test_routes_survive_dynamodb_decimals(decimal_demo, method, path, body):
    res = fin.handler(_event(method, path, body=body), None)
    assert res["statusCode"] == 200, res["body"]


def test_plain_numbers_preserves_int_and_float():
    out = fin.plain_numbers({
        "paise": Decimal("30000000"),
        "fractional_qty": Decimal("12.5"),
        "rate": Decimal("0.07"),
        "nested": [{"q": Decimal("30")}],
        "text": "2026-01-15",
        "none": None,
    })
    assert out["paise"] == 30000000 and isinstance(out["paise"], int)
    assert out["fractional_qty"] == 12.5 and isinstance(out["fractional_qty"], float)
    assert isinstance(out["rate"], float)
    assert isinstance(out["nested"][0]["q"], int)
    assert out["text"] == "2026-01-15"
    assert out["none"] is None


def test_load_user_data_includes_authenticated_users_transactions(monkeypatch):
    """Agent snapshot callers must receive the persisted transaction rows too."""
    queried = []

    monkeypatch.setattr(fin, "_get_user", lambda user_id: {"user_id": user_id})

    def query(table_env_var, user_id):
        queried.append((table_env_var, user_id))
        if table_env_var == "TRANSACTIONS_TABLE":
            return [{
                "txn_id": "txn-1",
                "txn_date": "2026-09-01",
                "amount_paise": Decimal("8500000"),
                "direction": "CREDIT",
            }]
        return []

    monkeypatch.setattr(fin, "_query_table", query)

    data = fin.load_user_data("user-123")

    assert ("TRANSACTIONS_TABLE", "user-123") in queried
    assert data["transactions"] == [{
        "txn_id": "txn-1",
        "txn_date": "2026-09-01",
        "amount_paise": 8500000,
        "direction": "CREDIT",
    }]


class _MutationTable:
    def __init__(self, item=None):
        self.item = item
        self.puts = []

    def get_item(self, **kwargs):
        key = kwargs["Key"]
        if self.item and self.item.get("user_id") == key.get("user_id"):
            if "txn_id" not in key or self.item.get("txn_id") == key.get("txn_id"):
                return {"Item": self.item}
        return {}

    def put_item(self, **kwargs):
        self.puts.append(kwargs)
        self.item = kwargs["Item"]

    def update_item(self, **kwargs):
        if self.item is None:
            return {"Attributes": {}}
        values = kwargs.get("ExpressionAttributeValues", {})
        self.item = {**self.item, "category": values.get(":category", self.item.get("category")),
                     "category_source": values.get(":source", self.item.get("category_source")),
                     "version": values.get(":next_version", self.item.get("version")),
                     "updated_at": values.get(":updated_at", self.item.get("updated_at"))}
        return {"Attributes": self.item}

    def query(self, **kwargs):
        return {"Items": [self.item] if self.item and self.item.get("user_id") == "user-123" else []}


class _ConditionalMutationTable(_MutationTable):
    def __init__(self, item=None, conditional_failure=False):
        super().__init__(item)
        self.conditional_failure = conditional_failure

    def update_item(self, **kwargs):
        if self.conditional_failure:
            error = RuntimeError("conditional failure")
            error.response = {"Error": {"Code": "ConditionalCheckFailedException"}}
            raise error
        assert kwargs["Key"]["user_id"] == "user-123"
        assert kwargs["Key"]["txn_sk"] == self.item["txn_sk"]
        self.item = {**self.item, "category": kwargs["ExpressionAttributeValues"][":category"],
                     "category_source": "user", "version": kwargs["ExpressionAttributeValues"][":next_version"]}
        return {"Attributes": self.item}


def test_fire_scenario_create_uses_verified_owner_and_validates_body(monkeypatch):
    table = _MutationTable()
    monkeypatch.setattr(fin, "_table", lambda name: table)
    monkeypatch.setattr(fin, "load_user_data", lambda user_id: DEMO_DATA)
    res = fin.handler(_event("POST", "/fire/scenarios", body={
        "name": "Retirement test", "inputs": {"target_age": 50},
    }), None)
    assert res["statusCode"] == 201
    saved = json.loads(res["body"])
    assert saved["scenario"]["user_id"] == "user-123"
    assert saved["scenario"]["name"] == "Retirement test"
    assert table.puts[0]["Item"]["user_id"] == "user-123"


def test_fire_scenario_rejects_malformed_body(monkeypatch):
    monkeypatch.setattr(fin, "_table", lambda name: _MutationTable())
    res = fin.handler(_event("POST", "/fire/scenarios", body={"inputs": []}), None)
    assert res["statusCode"] == 400
    assert json.loads(res["body"])["error"]["code"] == "VALIDATION_ERROR"


def test_transaction_category_update_enforces_owner_and_version(monkeypatch):
    table = _MutationTable({"user_id": "other-user", "txn_id": "txn-1", "category": "OTHER", "version": 2})
    monkeypatch.setattr(fin, "_table", lambda name: table)
    res = fin.handler(_event("PATCH", "/transactions/txn-1/category", body={
        "category": "GROCERIES", "version": 2,
    }), None)
    assert res["statusCode"] in {404, 409}

    table.item = {"user_id": "user-123", "txn_id": "txn-1", "category": "OTHER", "version": 3}
    stale = fin.handler(_event("PATCH", "/transactions/txn-1/category", body={
        "category": "GROCERIES", "version": 2,
    }), None)
    assert stale["statusCode"] == 409
    assert table.item["category"] == "OTHER"

    fresh = fin.handler(_event("PATCH", "/transactions/txn-1/category", body={
        "category": "GROCERIES", "version": 3,
    }), None)
    assert fresh["statusCode"] == 200
    assert table.item["category"] == "GROCERIES"


def test_transaction_category_update_translates_atomic_conditional_failure(monkeypatch):
    table = _ConditionalMutationTable({"user_id": "user-123", "txn_sk": "2026-09-01#txn-1",
                                       "txn_id": "txn-1", "category": "OTHER", "version": 3},
                                      conditional_failure=True)
    monkeypatch.setattr(fin, "_table", lambda name: table)
    res = fin.handler(_event("PATCH", "/transactions/txn-1/category", body={
        "category": "GROCERIES", "version": 3,
    }), None)
    assert res["statusCode"] == 409
    assert json.loads(res["body"])["error"]["code"] == "CONFLICT"


@pytest.mark.parametrize("inputs", [
    {"current_age": 17, "monthly_expenses_paise": 1, "monthly_investment_paise": 1,
     "current_corpus_paise": 0, "lifespan_age": 91},
    {"current_age": 40, "monthly_expenses_paise": 1, "monthly_investment_paise": 1,
     "current_corpus_paise": 0, "unknown": 1},
    {"current_age": 40, "monthly_expenses_paise": -1, "monthly_investment_paise": 1,
     "current_corpus_paise": 0},
])
def test_fire_scenario_rejects_invalid_or_unknown_inputs(monkeypatch, inputs):
    monkeypatch.setattr(fin, "_table", lambda name: _MutationTable())
    res = fin.handler(_event("POST", "/fire/scenarios", body={"name": "Bad", "inputs": inputs}), None)
    assert res["statusCode"] == 400
