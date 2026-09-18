"""FinanceFunction entrypoint.

Owns per architecture.md Stack layout:
  /portfolio/*, /securities/*, /fire/*, /net-worth*,
  /loans/emi, /loans/prepayment-impact,
  /statements/*, /cashflow/*, /calculators/*

Level 1 live routes: GET /portfolio/analysis, POST /fire/calculate,
POST /fire/goal-impact, GET /net-worth, GET /net-worth/projection.
Every other route still returns 501 exactly as the hour-0 stub.

Rules: identity only from get_authenticated_user_id (never a client
user_id); DynamoDB Query on partition key only, never Scan; table names
from env vars; pure math lives in finance/* (no boto3 there).
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import date, datetime, timezone
from decimal import Decimal

from boto3.dynamodb.conditions import Key

from finance import fire as fire_engine
from finance import networth as networth_engine
from finance import portfolio as portfolio_engine
from .auth import (
    UnauthorizedError,
    get_authenticated_user_id,
    not_implemented_response,
    unauthorized_response,
)

# (method, path-regex) — path regexes anchored. Instrument keys stay in
# query string per api-contract.md, never path params.
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

ROUTES: list[tuple[str, str]] = [
    ("GET", r"/portfolio/analysis"),
    ("GET", r"/securities/search"),
    ("GET", r"/securities/detail"),
    ("GET", r"/securities/history"),
    ("GET", r"/securities/fit"),
    ("GET", r"/securities/short-term-fit"),
    ("POST", r"/fire/calculate"),
    ("POST", r"/fire/goal-impact"),
    ("GET", r"/fire/scenarios"),
    ("POST", r"/fire/scenarios"),
    ("GET", r"/net-worth"),
    ("GET", r"/net-worth/projection"),
    ("POST", r"/loans/emi"),
    ("POST", r"/loans/prepayment-impact"),
    ("POST", r"/calculators/tax"),
    ("POST", r"/calculators/capital-gains"),
    ("POST", r"/calculators/insurance"),
    ("POST", r"/calculators/credit-card-payoff"),
    ("POST", r"/statements"),
    ("POST", r"/statements/[^/]+/process"),
    ("GET", r"/statements/[^/]+"),
    ("POST", r"/statements/[^/]+/commit"),
    ("GET", r"/cashflow/summary"),
    ("POST", r"/chat"),
]

LIVE_ROUTES = {
    ("GET", "/portfolio/analysis"),
    ("POST", "/fire/calculate"),
    ("POST", "/fire/goal-impact"),
    ("GET", "/net-worth"),
    ("GET", "/net-worth/projection"),
}


# ---------- response helpers (api-contract.md error envelope) ----------

def _ok(data: dict, status: int = 200) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(data, default=str),
    }


def _err(code: str, message: str, status: int, details: dict | None = None) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {"error": {"code": code, "message": message,
                       "details": details or {}}}
        ),
    }


def _validation(message: str, details: dict | None = None) -> dict:
    return _err("VALIDATION_ERROR", message, 400, details)


def _not_found(message: str) -> dict:
    return _err("NOT_FOUND", message, 404)


def _internal(message: str = "Internal error") -> dict:
    return _err("INTERNAL", message, 500)


# ---------- DynamoDB reads (Query on partition key only, never Scan) ----------

_dynamo = None


def _dynamodb():
    global _dynamo
    if _dynamo is None:
        import boto3

        _dynamo = boto3.resource("dynamodb")
    return _dynamo


def _query_table(table_env_var: str, user_id: str) -> list[dict]:
    table_name = os.environ.get(table_env_var)
    if not table_name:
        raise RuntimeError(f"Missing env var {table_env_var}")
    table = _dynamodb().Table(table_name)
    items: list[dict] = []
    kwargs: dict = {
        "KeyConditionExpression": Key("user_id").eq(user_id),
    }
    while True:
        page = table.query(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    return items


def _get_user(user_id: str) -> dict | None:
    table_name = os.environ.get("USERS_TABLE")
    if not table_name:
        raise RuntimeError("Missing env var USERS_TABLE")
    row = _dynamodb().Table(table_name).get_item(
        Key={"user_id": user_id}
    ).get("Item")
    return row


def plain_numbers(value):
    """DynamoDB returns every number as Decimal, which raises TypeError the
    moment finance/* mixes it with a float. Convert at this boundary so the
    pure modules only ever see int/float."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, list):
        return [plain_numbers(v) for v in value]
    if isinstance(value, dict):
        return {k: plain_numbers(v) for k, v in value.items()}
    return value


def load_user_data(user_id: str) -> dict:
    """All DynamoDB reads for the finance routes, keyed by Cognito sub."""
    return plain_numbers({
        "user": _get_user(user_id),
        "holdings": _query_table("HOLDINGS_TABLE", user_id),
        "goals": _query_table("GOALS_TABLE", user_id),
        "loans": _query_table("LOANS_TABLE", user_id),
    })


# ---------- Level-1 price shim (delete when Upstox lands) ----------

def resolve_holding_value(
    holding: dict, as_of: date
) -> tuple[int | None, int | None, str | None]:
    """(value_paise, price_paise, warning). Priority: manual value, FD
    accrued, cost-basis price with warning, else excluded with warning."""
    symbol = holding.get("symbol") or holding.get("name") or "holding"
    manual = holding.get("manual_current_value_paise")
    if manual is not None:
        return int(manual), None, None
    if holding.get("asset_type") == "FD":
        principal = holding.get("fd_principal_paise")
        rate = holding.get("fd_annual_rate")
        start = holding.get("fd_start_date")
        if principal is not None and rate is not None and start:
            if isinstance(start, str):
                start = date.fromisoformat(start)
            value = networth_engine.fd_accrued_value_paise(
                int(principal), float(rate), start, as_of,
                holding.get("fd_type") or "CUMULATIVE",
            )
            return int(round(value)), None, None
    quantity = holding.get("quantity")
    avg = holding.get("avg_buy_price_paise")
    if quantity is not None and avg is not None:
        value = int(round(float(quantity) * int(avg)))
        return value, int(avg), (
            f"live price unavailable for {symbol}, showing cost-basis "
            "price — Upstox integration pending"
        )
    return None, None, (
        f"{symbol} excluded from totals: missing price data "
        "(no manual value, FD terms, or cost basis)"
    )


def _priced_holdings(
    holdings: list[dict], as_of: date
) -> tuple[list[dict], list[str]]:
    """Resolve prices; skip unpriceable rows with a warnings entry each."""
    priced: list[dict] = []
    warnings: list[str] = []
    for h in holdings:
        value, price, warning = resolve_holding_value(h, as_of)
        if warning:
            warnings.append(warning)
        if value is None:
            continue
        priced.append(
            {
                "holding_id": h.get("holding_id"),
                "symbol": h.get("symbol") or h.get("name"),
                "asset_type": h.get("asset_type"),
                "quantity": h.get("quantity"),
                "price_paise": price,
                "value_paise": value,
                "avg_buy_price_paise": h.get("avg_buy_price_paise"),
                "sector": h.get("sector"),
            }
        )
    return priced, warnings


# ---------- shared input builders ----------

def _today() -> date:
    return datetime.now(timezone.utc).date()


def _current_age(user: dict, body: dict) -> int | None:
    if body.get("current_age") is not None:
        return int(body["current_age"])
    dob = user.get("date_of_birth")
    if not dob:
        return None
    if isinstance(dob, str):
        dob = date.fromisoformat(dob)
    today = _today()
    return today.year - dob.year - (
        (today.month, today.day) < (dob.month, dob.day)
    )


def _monthly_emi_paise(outstanding: float, annual_rate: float,
                       tenure_months: int) -> float:
    """Reducing-balance EMI. Local copy for FIRE loan outflows until the
    calculators-seed EMI module lands (keep in sync, then de-dup)."""
    if tenure_months <= 0:
        return 0.0
    if not annual_rate:
        return outstanding / tenure_months
    i = annual_rate / 12.0
    factor = (1 + i) ** tenure_months
    return outstanding * i * factor / (factor - 1)


def _fire_loan_inputs(
    loans: list[dict], current_age: int
) -> list[dict]:
    """Loans table rows -> fire.py {annual_emi_paise, end_age} inputs."""
    out = []
    today = _today()
    for loan in loans:
        outstanding = loan.get("outstanding_paise")
        if outstanding is None:
            continue
        emi = _monthly_emi_paise(
            float(outstanding),
            float(loan.get("annual_rate") or 0),
            int(loan.get("tenure_months") or 0),
        )
        start = loan.get("start_date")
        tenure = int(loan.get("tenure_months") or 0)
        if isinstance(start, str):
            start = date.fromisoformat(start)
        if start:
            end_year = start.year + (start.month - 1 + tenure) // 12
            end_age = current_age + (end_year - today.year)
        else:
            end_age = current_age + max(tenure // 12, 1)
        out.append({"annual_emi_paise": emi * 12.0, "end_age": end_age})
    return out


def _fire_goal_inputs(goals: list[dict]) -> list[dict]:
    return [
        {
            "goal_type": g.get("goal_type"),
            "amount_today_paise": g.get("amount_today_paise"),
            "target_age": g.get("target_age"),
            "inflation_rate": g.get("inflation_rate"),
        }
        for g in goals
        if g.get("amount_today_paise") is not None
        and g.get("target_age") is not None
    ]


def _parse_body(event: dict) -> dict:
    body = event.get("body")
    if body is None or body == "":
        return {}
    if isinstance(body, dict):
        data = body
    else:
        try:
            data = json.loads(body)
        except (ValueError, TypeError):
            return {"__invalid_json__": True}
    if not isinstance(data, dict):
        return {"__invalid_json__": True}
    data.pop("user_id", None)  # never trust client-supplied identity
    return data


def _build_fire_inputs(data: dict, body: dict, current_age: int) -> dict:
    """Assemble pure-engine inputs from Dynamo rows + body overrides."""
    user = data["user"]
    as_of = _today()
    priced, _ = _priced_holdings(data["holdings"], as_of)
    corpus = sum(
        h["value_paise"] for h in priced if h.get("asset_type") != "CASH"
    )
    loans = _fire_loan_inputs(data["loans"], current_age)
    inputs: dict = {
        "current_age": current_age,
        "monthly_expenses_paise": body.get("monthly_expenses_paise")
        if body.get("monthly_expenses_paise") is not None
        else user.get("monthly_expenses_paise"),
        "monthly_investment_paise": body.get("monthly_investment_paise")
        if body.get("monthly_investment_paise") is not None
        else user.get("monthly_investment_paise"),
        "current_corpus_paise": body.get("current_corpus_paise")
        if body.get("current_corpus_paise") is not None
        else corpus,
        "goals": _fire_goal_inputs(data["goals"]),
        "loans": loans,
    }
    for key in ("inflation", "step_up", "return_before_40",
                "return_40_to_60", "return_after_60", "post_fire_return",
                "lifespan_age"):
        if body.get(key) is not None:
            inputs[key] = body[key]
    return inputs


# ---------- the 5 live routes ----------

def portfolio_analysis_route(data: dict) -> dict:
    now = datetime.now(timezone.utc)
    priced, warnings = _priced_holdings(data["holdings"], now.date())
    result = portfolio_engine.analyze_portfolio(priced)
    holdings_out = []
    for raw, computed in zip(priced, result["holdings"]):
        holdings_out.append(
            {
                "holding_id": computed["holding_id"],
                "symbol": computed["symbol"],
                "asset_type": computed["asset_type"],
                "quantity": computed["quantity"],
                "price_paise": raw["price_paise"],
                "value_paise": computed["value_paise"],
                "weight_pct": computed["weight_pct"],
                "pnl_paise": computed["pnl_paise"],
                "price_as_of": now.isoformat(),
            }
        )
    warnings.append(
        "price history unavailable — volatility/drawdown/CAGR omitted, "
        "Upstox integration pending"
    )
    return _ok(
        {
            "as_of": now.isoformat(),
            "price_source": "MANUAL",
            "total_value_paise": result["total_value_paise"],
            "total_cost_paise": result["total_cost_paise"],
            "unrealized_pnl_paise": result["unrealized_pnl_paise"],
            "unrealized_pnl_pct": result["unrealized_pnl_pct"],
            "holdings": holdings_out,
            "allocation_by_asset_type": result["allocation_by_asset_type"],
            "allocation_by_sector": result["allocation_by_sector"],
            "risk": None,
            "flags": result["flags"],
            "warnings": warnings,
        }
    )


def fire_calculate_route(data: dict, body: dict) -> dict:
    user = data["user"]
    if user is None:
        return _not_found("User profile not found — complete onboarding first")
    current_age = _current_age(user, body)
    if current_age is None:
        return _validation(
            "current_age or user date_of_birth is required"
        )
    inputs = _build_fire_inputs(data, body, current_age)
    if inputs["monthly_expenses_paise"] is None:
        return _validation("monthly_expenses_paise is required "
                           "(profile or request override)")
    if inputs["monthly_investment_paise"] is None:
        return _validation("monthly_investment_paise is required "
                           "(profile or request override)")
    return _ok(fire_engine.calculate_fire(inputs))


def fire_goal_impact_route(data: dict, body: dict) -> dict:
    user = data["user"]
    if user is None:
        return _not_found("User profile not found — complete onboarding first")
    candidate = body.get("candidate_goal")
    if not isinstance(candidate, dict):
        return _validation("candidate_goal object is required")
    if candidate.get("amount_today_paise") is None or candidate.get(
        "target_age"
    ) is None:
        return _validation(
            "candidate_goal needs amount_today_paise and target_age"
        )
    current_age = _current_age(user, body)
    if current_age is None:
        return _validation(
            "current_age or user date_of_birth is required"
        )
    inputs = _build_fire_inputs(data, body, current_age)
    if inputs["monthly_expenses_paise"] is None:
        return _validation("monthly_expenses_paise is required "
                           "(profile or request override)")
    if inputs["monthly_investment_paise"] is None:
        return _validation("monthly_investment_paise is required "
                           "(profile or request override)")
    goal = {
        "goal_type": candidate.get("goal_type"),
        "amount_today_paise": candidate.get("amount_today_paise"),
        "target_age": candidate.get("target_age"),
        "inflation_rate": candidate.get("inflation_rate"),
    }
    return _ok(fire_engine.simulate_goal_impact(inputs, goal))


def net_worth_route(data: dict) -> dict:
    user = data["user"]
    if user is None:
        return _not_found("User profile not found — complete onboarding first")
    as_of = _today()
    priced, warnings = _priced_holdings(data["holdings"], as_of)
    holdings_value = sum(
        h["value_paise"] for h in priced if h.get("asset_type") != "CASH"
    )
    fd_value = sum(
        h["value_paise"] for h in priced if h.get("asset_type") == "FD"
    )
    non_fd_value = holdings_value - fd_value
    liabilities = sum(int(loan.get("outstanding_paise") or 0)
                      for loan in data["loans"])
    totals = networth_engine.calculate_net_worth(
        holdings_value_paise=non_fd_value,
        fd_accrued_paise=float(fd_value),
        cash_paise=user.get("cash_balance_paise"),
        declared_net_worth_paise=user.get("declared_net_worth_paise"),
        liabilities_paise=liabilities,
        has_holdings=bool(data["holdings"]),
    )
    monthly_emis = [
        _monthly_emi_paise(
            float(loan.get("outstanding_paise") or 0),
            float(loan.get("annual_rate") or 0),
            int(loan.get("tenure_months") or 0),
        )
        for loan in data["loans"]
        if loan.get("outstanding_paise")
    ]
    coverage = networth_engine.emergency_fund_coverage_months(
        int(user.get("cash_balance_paise") or 0),
        int(user.get("monthly_expenses_paise") or 0),
        [int(round(e)) for e in monthly_emis],
    )
    return _ok(
        {
            **totals,
            "as_of": datetime.now(timezone.utc).isoformat(),
            "cash_balance_paise": int(user.get("cash_balance_paise") or 0),
            "emergency_fund_coverage_months": coverage,
            "warnings": warnings,
        }
    )


def net_worth_projection_route(data: dict, query: dict) -> dict:
    user = data["user"]
    if user is None:
        return _not_found("User profile not found — complete onboarding first")
    try:
        years = int((query or {}).get("years", 30))
    except (ValueError, TypeError):
        return _validation("years must be an integer")
    if not 1 <= years <= 80:
        return _validation("years must be between 1 and 80")
    current_age = _current_age(user, {})
    if current_age is None:
        return _validation(
            "user date_of_birth is required for projections"
        )
    as_of = _today()
    priced, warnings = _priced_holdings(data["holdings"], as_of)
    invested = sum(
        h["value_paise"] for h in priced if h.get("asset_type") != "CASH"
    )
    fire_inputs = _build_fire_inputs(data, {}, current_age)
    fire_result = fire_engine.calculate_fire(fire_inputs)
    curve = networth_engine.project_net_worth(
        {
            "current_age": current_age,
            "current_invested_paise": invested,
            "monthly_expenses_paise": user.get("monthly_expenses_paise") or 0,
            "monthly_investment_paise": user.get("monthly_investment_paise")
            or 0,
            "goals": _fire_goal_inputs(data["goals"]),
            "loans": _fire_loan_inputs(data["loans"], current_age),
            "fire_age": fire_result["fire_age"],
        },
        years=years,
    )
    return _ok(
        {
            "as_of": datetime.now(timezone.utc).isoformat(),
            "fire_age": fire_result["fire_age"],
            "assumptions": fire_result["assumptions"],
            "curve": curve,
            "warnings": warnings + fire_result["warnings"],
        }
    )


# ---------- router ----------

def _method_and_path(event: dict) -> tuple[str, str]:
    http = (event.get("requestContext") or {}).get("http") or {}
    method = http.get("method") or event.get("httpMethod", "")
    path = http.get("path") or event.get("rawPath") or event.get("path", "")
    return method.upper(), path


def handler(event: dict, context) -> dict:
    try:
        user_id = get_authenticated_user_id(event)
    except UnauthorizedError:
        return unauthorized_response()

    method, path = _method_and_path(event)
    route_label = f"{method} {path}"

    matched = None
    for route_method, pattern in ROUTES:
        if method == route_method and re.fullmatch(pattern, path):
            matched = (route_method, pattern)
            break
    if matched is None:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {"error": {"code": "NOT_FOUND",
                           "message": f"Unknown route {route_label}"}}
            ),
        }

    if (method, path) not in LIVE_ROUTES:
        return not_implemented_response(route_label)

    try:
        body = _parse_body(event)
        if "__invalid_json__" in body:
            return _validation("Request body must be a JSON object")
        query = event.get("queryStringParameters") or {}
        data = load_user_data(user_id)
        if (method, path) == ("GET", "/portfolio/analysis"):
            return portfolio_analysis_route(data)
        if (method, path) == ("POST", "/fire/calculate"):
            return fire_calculate_route(data, body)
        if (method, path) == ("POST", "/fire/goal-impact"):
            return fire_goal_impact_route(data, body)
        if (method, path) == ("GET", "/net-worth"):
            return net_worth_route(data)
        if (method, path) == ("GET", "/net-worth/projection"):
            return net_worth_projection_route(data, query)
    except UnauthorizedError:
        return unauthorized_response()
    except Exception:
        logger.exception("Unhandled error on %s", route_label)
        return _internal()
    return not_implemented_response(route_label)


# SAM / local alias
lambda_handler = handler
