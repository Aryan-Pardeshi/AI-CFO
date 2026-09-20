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
import math
import os
import re
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from boto3.dynamodb.conditions import Key

from finance import fire as fire_engine
from finance import fit as fit_engine
from finance import networth as networth_engine
from finance import portfolio as portfolio_engine
from integrations import upstox
from statements.categorizer import categorize_rows
from statements.dto import TransactionDTO
from statements.errors import (
    StatementConflictError,
    StatementNotFoundError,
    StatementUpstreamError,
    StatementValidationError,
)
from statements.parser import MAX_BYTES, MAX_ROWS, parse_csv
from statements.summaries import summarize_transactions
from statements.validator import validate_rows
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

SAFE_CHAT_DISPATCH_ERROR = "Unable to start this chat right now. Please try again."

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
    ("PATCH", r"/transactions/[^/]+/category"),
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
    ("GET", "/securities/search"),
    ("GET", "/securities/detail"),
    ("GET", "/securities/history"),
    ("GET", "/securities/fit"),
    ("POST", "/fire/calculate"),
    ("POST", "/fire/goal-impact"),
    ("GET", "/net-worth"),
    ("GET", "/net-worth/projection"),
    ("POST", "/chat"),
    ("POST", "/fire/scenarios"),
    ("PATCH", "/transactions/[^/]+/category"),
}

TXN_CATEGORIES = {
    "INCOME", "RENT", "GROCERIES", "FOOD_DELIVERY", "DINING", "TRANSPORT",
    "SHOPPING", "UTILITIES", "SUBSCRIPTIONS", "EMI", "INVESTMENTS", "TRANSFER",
    "HEALTH", "EDUCATION", "ENTERTAINMENT", "OTHER",
}

FIRE_SCENARIO_FIELDS = {
    "target_age": (int, 18, 120),
    "current_age": (int, 18, 100),
    "monthly_expenses_paise": (int, 0, 10_000_000_000_000),
    "monthly_investment_paise": (int, 0, 10_000_000_000_000),
    "current_corpus_paise": (int, 0, 100_000_000_000_000_000),
    "goals": (list, 0, 50),
    "loans": (list, 0, 50),
    "inflation": (float, 0.0, 1.0),
    "step_up": (float, 0.0, 1.0),
    "return_before_40": (float, -1.0, 2.0),
    "return_40_to_60": (float, -1.0, 2.0),
    "return_after_60": (float, -1.0, 2.0),
    "post_fire_return": (float, -1.0, 2.0),
    "lifespan_age": (int, 40, 120),
}


def _validate_fire_scenario_inputs(inputs: object) -> dict | None:
    """Validate the persisted FIRE override schema; never accept arbitrary dicts."""
    if not isinstance(inputs, dict) or not inputs:
        return None
    if any(key not in FIRE_SCENARIO_FIELDS for key in inputs):
        return None
    for key, value in inputs.items():
        expected, minimum, maximum = FIRE_SCENARIO_FIELDS[key]
        if key in {"goals", "loans"}:
            if not isinstance(value, list) or len(value) > maximum:
                return None
            allowed = ({"goal_type", "amount_today_paise", "target_age", "inflation_rate"}
                       if key == "goals" else {"annual_emi_paise", "end_age"})
            for item in value:
                if not isinstance(item, dict) or any(field not in allowed for field in item):
                    return None
                for field, number in item.items():
                    if isinstance(number, bool) or field in {"goal_type"}:
                        if field == "goal_type" and isinstance(number, str) and number.strip():
                            continue
                        return None
                    if not isinstance(number, (int, float)) or number < 0:
                        return None
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        if expected is int and not isinstance(value, int):
            return None
        numeric = float(value)
        if not math.isfinite(numeric) or numeric < minimum or numeric > maximum:
            return None
    return dict(inputs)


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


def _conflict(message: str) -> dict:
    return _err("CONFLICT", message, 409)


def _upstream(message: str) -> dict:
    return _err("UPSTREAM_UNAVAILABLE", message, 502)


def _internal(message: str = "Internal error") -> dict:
    return _err("INTERNAL", message, 500)


# ---------- DynamoDB reads (Query on partition key only, never Scan) ----------

_dynamo = None
_s3 = None


def _dynamodb():
    global _dynamo
    if _dynamo is None:
        import boto3

        _dynamo = boto3.resource("dynamodb")
    return _dynamo


def _s3_client():
    global _s3
    if _s3 is None:
        import boto3

        _s3 = boto3.client("s3")
    return _s3


def _table(env_var: str):
    table_name = os.environ.get(env_var)
    if not table_name:
        raise RuntimeError(f"Missing env var {env_var}")
    return _dynamodb().Table(table_name)


def _statement_jobs_table():
    return _table("STATEMENT_JOBS_TABLE")


def _chat_jobs_table():
    return _table("CHAT_JOBS_TABLE")


_lambda = None


def _lambda_client():
    global _lambda
    if _lambda is None:
        import boto3

        _lambda = boto3.client("lambda")
    return _lambda


def _chat_uuid(value: object | None) -> str:
    if value is None:
        return str(uuid.uuid4())
    if not isinstance(value, str):
        raise ValueError("must be a UUID string")
    return str(uuid.UUID(value))


def post_chat_route(user_id: str, body: dict) -> dict:
    """Persist QUEUED then async-invoke AgentFunction. Identity = verified sub only."""
    message = body.get("message")
    if not isinstance(message, str) or not message.strip():
        return _validation("message is required and must be a non-empty string")
    if len(message) > 8000:
        return _validation("message must be at most 8000 characters")
    try:
        job_id = _chat_uuid(body.get("job_id"))
        conversation_id = _chat_uuid(body.get("conversation_id"))
    except ValueError:
        return _validation("job_id and conversation_id must be UUID strings")
    now = datetime.now(timezone.utc).isoformat()
    job = {
        "user_id": user_id,
        "job_id": job_id,
        "conversation_id": conversation_id,
        "status": "QUEUED",
        "message": message.strip(),
        "tool_calls": [],
        "created_at": now,
        "updated_at": now,
    }
    table = _chat_jobs_table()
    try:
        table.put_item(
            Item=job,
            ConditionExpression="attribute_not_exists(user_id) AND attribute_not_exists(job_id)",
        )
    except Exception as exc:
        if getattr(exc, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            existing = table.get_item(
                Key={"user_id": user_id, "job_id": job_id}
            ).get("Item")
            if existing and existing.get("user_id") == user_id:
                return _ok({"job_id": job_id,
                            "conversation_id": existing.get("conversation_id") or conversation_id},
                           200)
            return _conflict("chat job already exists")
        raise
    try:
        agent_name = os.environ.get("AGENT_FUNCTION_NAME")
        if not agent_name:
            raise RuntimeError("Missing AGENT_FUNCTION_NAME")
        # Verified identity only — never any client-supplied id, email, or token.
        _lambda_client().invoke(
            FunctionName=agent_name,
            InvocationType="Event",
            Payload=json.dumps({
                "user_id": user_id,
                "job_id": job_id,
                "conversation_id": conversation_id,
                "message": message.strip(),
            }),
        )
    except Exception as exc:
        logger.info({"event": "chat_async_dispatch_failed",
                     "error_class": type(exc).__name__})
        job.update({"status": "FAILED", "error": SAFE_CHAT_DISPATCH_ERROR,
                    "updated_at": datetime.now(timezone.utc).isoformat()})
        try:
            table.put_item(Item=job)
        except Exception as mark_exc:
            logger.info({"event": "chat_dispatch_failure_unpersisted",
                         "error_class": type(mark_exc).__name__})
    return _ok({"job_id": job_id, "conversation_id": conversation_id}, 202)


def _transactions_table():
    return _table("TRANSACTIONS_TABLE")


def _fire_scenarios_table():
    return _table("FIRE_SCENARIOS_TABLE")


def create_fire_scenario_route(user_id: str, body: dict) -> dict:
    name = body.get("name")
    inputs = body.get("inputs")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        return _validation("name is required and must be at most 120 characters")
    inputs = _validate_fire_scenario_inputs(inputs)
    if inputs is None:
        return _validation("inputs contain an unknown field or invalid value")
    now = datetime.now(timezone.utc).isoformat()
    scenario = {
        "user_id": user_id,
        "scenario_id": str(uuid.uuid4()),
        "name": name.strip(),
        "inputs": inputs,
        "created_at": now,
        "updated_at": now,
        "version": 1,
    }
    _fire_scenarios_table().put_item(Item=scenario)
    return _ok({"scenario": scenario}, 201)


def update_transaction_category_route(user_id: str, txn_id: str, body: dict) -> dict:
    category = body.get("category")
    version = body.get("version")
    if not isinstance(category, str) or category not in TXN_CATEGORIES:
        return _validation("category is invalid")
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        return _validation("version is required")
    table = _transactions_table()
    rows = table.query(KeyConditionExpression=Key("user_id").eq(user_id)).get("Items", [])
    row = next((candidate for candidate in rows if candidate.get("txn_id") == txn_id
                or str(candidate.get("txn_sk", "")).endswith(f"#{txn_id}")), None)
    if not row:
        return _not_found("Transaction not found")
    if int(row.get("version") or 1) != version:
        return _conflict("Transaction changed; refresh and try again")
    now = datetime.now(timezone.utc).isoformat()
    key = {"user_id": user_id, "txn_sk": row.get("txn_sk") or row.get("txn_id")}
    try:
        result = table.update_item(
            Key=key,
            UpdateExpression="SET category = :category, category_source = :source, #version = :next_version, updated_at = :updated_at",
            ConditionExpression="#version = :expected_version",
            ExpressionAttributeNames={"#version": "version"},
            ExpressionAttributeValues={
                ":category": category,
                ":source": "user",
                ":expected_version": version,
                ":next_version": version + 1,
                ":updated_at": now,
            },
            ReturnValues="ALL_NEW",
        )
    except Exception as exc:
        if getattr(exc, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return _conflict("Transaction changed; refresh and try again")
        raise
    updated = result.get("Attributes") or {**row, "category": category, "category_source": "user",
                                            "version": version + 1, "updated_at": now}
    return _ok({"transaction": updated})


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
        "transactions": _query_table("TRANSACTIONS_TABLE", user_id),
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
    out = []
    for g in goals:
        amt = g.get("amount_today_paise")
        target = g.get("target_age")
        if amt is None or target is None:
            continue
        infl = g.get("inflation_rate")
        try:
            infl_val = float(infl) if infl is not None else None
        except (ValueError, TypeError):
            infl_val = None
        try:
            amt_val = int(amt)
            target_val = int(target)
        except (ValueError, TypeError):
            continue
        out.append({
            "goal_type": g.get("goal_type"),
            "amount_today_paise": amt_val,
            "target_age": target_val,
            "inflation_rate": infl_val,
        })
    return out


def _parse_body(event: dict, *, strip_identity: bool = True) -> dict:
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
    if strip_identity:
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


# ---------- Securities routes (Upstox + ARIA fit) ----------

def securities_search_route(query: dict) -> dict:
    q = (query or {}).get("q")
    if not q or not isinstance(q, str) or not q.strip():
        return _validation("Search query 'q' is required and must be non-empty")
    try:
        results = upstox.search_securities(q)
        return _ok({"results": results})
    except upstox.SecurityValidationError as exc:
        return _validation(str(exc))
    except upstox.SecurityUpstreamError as exc:
        return _upstream(str(exc))


def securities_detail_route(user_id: str, query: dict) -> dict:
    instrument_key = (query or {}).get("instrument_key")
    if not instrument_key or not isinstance(instrument_key, str) or not instrument_key.strip():
        return _validation("instrument_key query parameter is required")
    try:
        detail = upstox.get_security_detail(instrument_key)
    except upstox.SecurityValidationError as exc:
        return _validation(str(exc))
    except upstox.SecurityNotFoundError as exc:
        return _not_found(str(exc))
    except upstox.SecurityUpstreamError as exc:
        return _upstream(str(exc))

    # Check if the authenticated user owns this security
    data = load_user_data(user_id)
    holdings = data.get("holdings", [])
    sec = detail.get("security") or {}
    target_key = sec.get("instrument_key")
    target_sym = (sec.get("symbol") or "").upper()
    quote = detail.get("quote") or {}
    current_price_paise = quote.get("last_price_paise")

    user_holding = None
    for h in holdings:
        h_key = h.get("instrument_key")
        h_sym = (h.get("symbol") or "").upper()
        if (target_key and h_key == target_key) or (target_sym and h_sym == target_sym):
            qty = float(h.get("quantity") or 0)
            avg_price = int(h.get("avg_buy_price_paise") or 0)
            invested_val = int(round(qty * avg_price))
            curr_val = int(round(qty * current_price_paise)) if current_price_paise else invested_val
            pnl_paise = curr_val - invested_val
            pnl_pct = round((pnl_paise / invested_val) * 100, 2) if invested_val > 0 else 0.0
            user_holding = {
                "holding_id": h.get("holding_id"),
                "symbol": sec.get("symbol"),
                "quantity": qty if qty != int(qty) else int(qty),
                "avg_buy_price_paise": avg_price,
                "invested_value_paise": invested_val,
                "current_value_paise": curr_val,
                "unrealized_pnl_paise": pnl_paise,
                "unrealized_pnl_pct": pnl_pct,
            }
            break

    detail["holding"] = user_holding
    return _ok(detail)


def securities_history_route(query: dict) -> dict:
    instrument_key = (query or {}).get("instrument_key")
    if not instrument_key or not isinstance(instrument_key, str) or not instrument_key.strip():
        return _validation("instrument_key query parameter is required")
    period = (query or {}).get("period", "1y")
    try:
        history = upstox.get_security_history(instrument_key, period)
        return _ok(history)
    except upstox.SecurityValidationError as exc:
        return _validation(str(exc))
    except upstox.SecurityNotFoundError as exc:
        return _not_found(str(exc))
    except upstox.SecurityUpstreamError as exc:
        return _upstream(str(exc))


def securities_fit_route(user_id: str, query: dict) -> dict:
    instrument_key = (query or {}).get("instrument_key")
    if not instrument_key or not isinstance(instrument_key, str) or not instrument_key.strip():
        return _validation("instrument_key query parameter is required")
    raw_amount = (query or {}).get("add_amount_paise")
    if raw_amount is None:
        return _validation("add_amount_paise query parameter is required")
    try:
        add_amount_paise = int(raw_amount)
    except (ValueError, TypeError):
        return _validation("add_amount_paise must be an integer")
    if add_amount_paise <= 0:
        return _validation("add_amount_paise must be a positive integer in paise")
    if add_amount_paise > 100000000000:
        return _validation("add_amount_paise exceeds maximum supported amount")

    inst = upstox.find_instrument(instrument_key)
    if not inst:
        return _not_found(f"Security '{instrument_key}' not found in index")

    quote = None
    source = "UPSTOX"
    as_of = datetime.now(timezone.utc).isoformat()
    try:
        detail = upstox.get_security_detail(instrument_key)
        quote = detail.get("quote")
        source = detail.get("source", "UPSTOX")
        as_of = detail.get("as_of", as_of)
    except upstox.SecurityUpstreamError:
        quote = None

    data = load_user_data(user_id)
    user_profile = data.get("user")
    raw_holdings = data.get("holdings", [])
    priced_holdings, _ = _priced_holdings(raw_holdings, _today())

    result = fit_engine.calculate_portfolio_fit(
        user_profile=user_profile,
        holdings=priced_holdings,
        security=inst,
        add_amount_paise=add_amount_paise,
        quote=quote,
        source=source,
        as_of=as_of,
    )
    return _ok(result)


def _statement_bucket() -> str:
    bucket = os.environ.get("DATA_BUCKET")
    if not bucket:
        raise RuntimeError("Missing env var DATA_BUCKET")
    return bucket


def _uuid(value: object | None) -> str:
    if value is None:
        return str(uuid.uuid4())
    if not isinstance(value, str):
        raise StatementValidationError("job_id must be a UUID")
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise StatementValidationError("job_id must be a UUID") from exc


def _safe_file_name(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise StatementValidationError("file_name is required")
    if len(value) > 255:
        raise StatementValidationError("file_name must be at most 255 characters")
    name = os.path.basename(value.replace("\\", "/"))
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    if not name or not name.lower().endswith(".csv"):
        raise StatementValidationError("file_name must be a CSV filename")
    return name[:120]


def _user_key_part(user_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", user_id)


def _owned_statement_job(user_id: str, job_id: str) -> dict:
    item = _statement_jobs_table().get_item(
        Key={"user_id": user_id, "job_id": job_id}
    ).get("Item")
    if not item or item.get("user_id") != user_id:
        raise StatementNotFoundError("statement job not found")
    return plain_numbers(item)


def _save_review_rows(review_key: str, rows: list[dict], summary: dict) -> None:
    payload = json.dumps({"rows": rows, "summary": summary}, separators=(",", ":")).encode()
    _s3_client().put_object(
        Bucket=_statement_bucket(),
        Key=review_key,
        Body=payload,
        ContentType="application/json",
        ServerSideEncryption="AES256",
    )


def _read_review_rows(review_key: str) -> tuple[list[dict], dict]:
    try:
        raw = _s3_client().get_object(Bucket=_statement_bucket(), Key=review_key)["Body"].read()
    except Exception as exc:
        raise StatementUpstreamError("review artifact unavailable") from exc
    payload = json.loads(raw.decode("utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("rows"), list):
        raise StatementValidationError("stored review artifact is invalid")
    return payload["rows"], payload.get("summary") or {}


def create_statement_route(user_id: str, body: dict) -> dict:
    allowed = {"job_id", "file_name", "input_type", "content_type"}
    supplied_identity = {key for key in ("user_id", "email") if key in body}
    if supplied_identity:
        raise StatementValidationError("client identity fields are not accepted")
    unknown = set(body) - allowed
    if unknown:
        raise StatementValidationError("unsupported statement request fields")
    if body.get("input_type") != "csv":
        raise StatementValidationError("only input_type=csv is supported in Level 1")
    if body.get("content_type") != "text/csv":
        raise StatementValidationError("content_type must be text/csv")
    job_id = _uuid(body.get("job_id"))
    file_name = _safe_file_name(body.get("file_name"))
    user_part = _user_key_part(user_id)
    s3_key = f"statements/{user_part}/{job_id}/{file_name}"
    review_key = f"statements/{user_part}/{job_id}/review.json"
    now = datetime.now(timezone.utc).isoformat()
    job = {
        "user_id": user_id,
        "job_id": job_id,
        "file_name": file_name,
        "input_type": "csv",
        "content_type": "text/csv",
        "s3_key": s3_key,
        "review_s3_key": review_key,
        "status": "PENDING_UPLOAD",
        "created_at": now,
        "updated_at": now,
    }
    try:
        _statement_jobs_table().put_item(Item=job, ConditionExpression="attribute_not_exists(job_id)")
    except Exception as exc:
        if getattr(exc, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            raise StatementConflictError("statement job already exists") from exc
        raise
    url = _s3_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": _statement_bucket(), "Key": s3_key, "ContentType": "text/csv"},
        ExpiresIn=900,
    )
    return _ok({
        "job_id": job_id,
        "status": "PENDING_UPLOAD",
        "file_name": file_name,
        "upload": {"url": url, "key": s3_key, "expires_in": 900},
    }, 201)


def _download_csv(job: dict) -> bytes:
    try:
        response = _s3_client().get_object(Bucket=_statement_bucket(), Key=job["s3_key"])
        if response.get("ContentLength") is not None and int(response["ContentLength"]) > MAX_BYTES:
            raise StatementValidationError("uploaded CSV exceeds the 1 MiB limit")
        content = response["Body"].read(MAX_BYTES + 1)
    except StatementValidationError:
        raise
    except Exception as exc:
        if getattr(exc, "response", {}).get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
            raise StatementValidationError("no uploaded CSV found for this job; upload the file first") from exc
        raise StatementUpstreamError("uploaded statement is unavailable") from exc
    if len(content) > MAX_BYTES:
        raise StatementValidationError("uploaded CSV exceeds the 1 MiB limit")
    return content


def process_statement_route(user_id: str, job_id: str) -> dict:
    job = _owned_statement_job(user_id, job_id)
    if job.get("status") == "COMMITTED":
        raise StatementConflictError("statement job is already committed")
    parsed = parse_csv(_download_csv(job))
    validated, validation_summary = validate_rows(parsed)
    categorized = categorize_rows(validated)
    rows = [row.to_dict() for row in categorized]
    _save_review_rows(job["review_s3_key"], rows, validation_summary)
    now = datetime.now(timezone.utc).isoformat()
    _statement_jobs_table().put_item(Item={
        **job,
        "status": "REVIEW_REQUIRED",
        "validation_summary": validation_summary,
        "reconciliation_summary": {
            "reconciled": validation_summary["reconciled"],
            "balance_delta_paise": validation_summary["balance_delta_paise"],
        },
        "updated_at": now,
    })
    return _ok({
        "job_id": job_id,
        "status": "REVIEW_REQUIRED",
        "validation_summary": validation_summary,
        "reconciliation_summary": {
            "reconciled": validation_summary["reconciled"],
            "balance_delta_paise": validation_summary["balance_delta_paise"],
        },
    }, 202)


def get_statement_route(user_id: str, job_id: str) -> dict:
    job = _owned_statement_job(user_id, job_id)
    rows: list[dict] = []
    summary = job.get("validation_summary") or {
        "row_count": 0,
        "credit_total_paise": 0,
        "debit_total_paise": 0,
        "net_paise": 0,
        "reconciled": False,
        "balance_delta_paise": 0,
    }
    if job.get("status") in {"REVIEW_REQUIRED", "COMMITTED"}:
        rows, stored_summary = _read_review_rows(job["review_s3_key"])
        summary = stored_summary or summary
    return _ok({
        "job_id": job_id,
        "file_name": job.get("file_name"),
        "status": job.get("status"),
        "validation_summary": summary,
        "reconciliation_summary": job.get("reconciliation_summary") or {
            "reconciled": summary.get("reconciled", False),
            "balance_delta_paise": summary.get("balance_delta_paise", 0),
        },
        "review_rows": rows,
    })


def _review_transactions(rows: object) -> list[TransactionDTO]:
    if not isinstance(rows, list) or not rows or len(rows) > MAX_ROWS:
        raise StatementValidationError("reviewed_rows must contain 1 to 1000 rows")
    normalized: list[dict] = []
    ids: set[str] = set()
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise StatementValidationError(f"review row {index} must be an object")
        txn_id = row.get("txn_id") or f"row-{index}"
        if not isinstance(txn_id, str) or not txn_id or len(txn_id) > 120 or txn_id in ids:
            raise StatementValidationError("review rows must have unique txn_id values")
        ids.add(txn_id)
        normalized.append({
            "txn_id": txn_id,
            "txn_date": row.get("txn_date"),
            "description": row.get("description"),
            "amount_paise": row.get("amount_paise"),
            "direction": str(row.get("direction") or "").upper(),
            "balance_paise": row.get("balance_paise"),
        })
    validated, _ = validate_rows(normalized)
    output: list[TransactionDTO] = []
    for original, row in zip(rows, validated):
        category = str(original.get("category") or "").upper()
        if category and category not in TXN_CATEGORIES:
            raise StatementValidationError("review row category is invalid")
        source = str(original.get("category_source") or ("user" if category else "rule")).lower()
        if source not in {"rule", "user"}:
            raise StatementValidationError("review row category_source is invalid")
        output.append(TransactionDTO(
            txn_id=str(original.get("txn_id") or row.txn_id),
            txn_date=row.txn_date,
            description=row.description,
            amount_paise=row.amount_paise,
            direction=row.direction,
            category=category or None,
            category_source=source,
            balance_paise=row.balance_paise,
        ))
    categorized = categorize_rows(output)
    return [
        TransactionDTO(
            txn_id=row.txn_id,
            txn_date=row.txn_date,
            description=row.description,
            amount_paise=row.amount_paise,
            direction=row.direction,
            category=original.category or row.category,
            category_source=original.category_source or row.category_source,
            balance_paise=row.balance_paise,
        )
        for original, row in zip(output, categorized)
    ]


def commit_statement_route(user_id: str, job_id: str, body: dict) -> dict:
    job = _owned_statement_job(user_id, job_id)
    if job.get("status") == "COMMITTED":
        return _ok({
            "job_id": job_id,
            "status": "COMMITTED",
            "summary": job.get("commit_summary") or {},
            "committed_row_count": int(job.get("committed_row_count") or 0),
        })
    if job.get("status") != "REVIEW_REQUIRED":
        raise StatementConflictError("statement job is not ready for commit")
    if isinstance(body.get("reviewed_rows"), list):
        reviewed = body["reviewed_rows"]
    elif body.get("confirm_stored_rows") is True:
        reviewed, _ = _read_review_rows(job["review_s3_key"])
    else:
        raise StatementValidationError("explicit reviewed_rows or confirm_stored_rows=true is required")
    transactions = _review_transactions(reviewed)
    summary = summarize_transactions(transactions)
    table = _transactions_table()
    for row in transactions:
        try:
            table.put_item(Item={
                "user_id": user_id,
                "txn_sk": f"{row.txn_date}#{row.txn_id}",
                "txn_id": row.txn_id,
                "txn_date": row.txn_date,
                "description": row.description,
                "amount_paise": row.amount_paise,
                "direction": row.direction,
                "category": row.category,
                "category_source": row.category_source,
                "balance_paise": row.balance_paise,
                "source_job_id": job_id,
            }, ConditionExpression="attribute_not_exists(user_id) AND attribute_not_exists(txn_sk)")
        except Exception as exc:
            error_code = getattr(exc, "response", {}).get("Error", {}).get("Code")
            if error_code != "ConditionalCheckFailedException":
                raise
    now = datetime.now(timezone.utc).isoformat()
    _save_review_rows(job["review_s3_key"], [row.to_dict() for row in transactions], summary)
    _statement_jobs_table().put_item(Item={
        **job,
        "status": "COMMITTED",
        "commit_summary": summary,
        "committed_row_count": len(transactions),
        "updated_at": now,
    })
    return _ok({
        "job_id": job_id,
        "status": "COMMITTED",
        "summary": summary,
        "committed_row_count": len(transactions),
    })


def cashflow_summary_route(user_id: str) -> dict:
    raw_rows = plain_numbers(_query_table("TRANSACTIONS_TABLE", user_id))
    rows = [TransactionDTO(
        txn_id=str(row.get("txn_id") or row.get("txn_sk", "").split("#", 1)[-1]),
        txn_date=str(row["txn_date"]),
        description=str(row.get("description") or ""),
        amount_paise=int(row["amount_paise"]),
        direction=str(row["direction"]),
        category=row.get("category"),
        category_source=row.get("category_source"),
        balance_paise=(int(row["balance_paise"]) if row.get("balance_paise") is not None else None),
    ) for row in raw_rows]
    summary = summarize_transactions(rows)
    balances = [row.balance_paise for row in rows if row.balance_paise is not None]
    return _ok({**summary, "current_balance_paise": balances[-1] if balances else None})


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

    statements_live = (
        method == "POST" and path == "/statements"
    ) or re.fullmatch(r"(?:POST|GET) /statements/[^/]+(?:/process|/commit)?", f"{method} {path}")
    cashflow_live = method == "GET" and path == "/cashflow/summary"
    category_live = method == "PATCH" and re.fullmatch(r"/transactions/[^/]+/category", path)
    scenario_live = method == "POST" and path == "/fire/scenarios"
    if (method, path) not in LIVE_ROUTES and not statements_live and not cashflow_live and not category_live and not scenario_live:
        return not_implemented_response(route_label)

    try:
        is_create_statement = method == "POST" and path == "/statements"
        body = _parse_body(event, strip_identity=not is_create_statement)
        if "__invalid_json__" in body:
            return _validation("Request body must be a JSON object")
        query = event.get("queryStringParameters") or {}
        if is_create_statement:
            return create_statement_route(user_id, body)
        process_match = re.fullmatch(r"/statements/([^/]+)/process", path)
        if method == "POST" and process_match:
            return process_statement_route(user_id, process_match.group(1))
        statement_match = re.fullmatch(r"/statements/([^/]+)", path)
        if method == "GET" and statement_match:
            return get_statement_route(user_id, statement_match.group(1))
        commit_match = re.fullmatch(r"/statements/([^/]+)/commit", path)
        if method == "POST" and commit_match:
            return commit_statement_route(user_id, commit_match.group(1), body)
        if method == "GET" and path == "/cashflow/summary":
            return cashflow_summary_route(user_id)
        if method == "POST" and path == "/chat":
            return post_chat_route(user_id, body)
        if method == "POST" and path == "/fire/scenarios":
            return create_fire_scenario_route(user_id, body)
        category_match = re.fullmatch(r"/transactions/([^/]+)/category", path)
        if method == "PATCH" and category_match:
            return update_transaction_category_route(user_id, category_match.group(1), body)
        data = load_user_data(user_id)
        if (method, path) == ("GET", "/portfolio/analysis"):
            return portfolio_analysis_route(data)
        if (method, path) == ("GET", "/securities/search"):
            return securities_search_route(query)
        if (method, path) == ("GET", "/securities/detail"):
            return securities_detail_route(user_id, query)
        if (method, path) == ("GET", "/securities/history"):
            return securities_history_route(query)
        if (method, path) == ("GET", "/securities/fit"):
            return securities_fit_route(user_id, query)
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
    except StatementValidationError as exc:
        return _validation(str(exc))
    except StatementNotFoundError:
        return _not_found("Statement job not found")
    except StatementConflictError as exc:
        return _conflict(str(exc))
    except StatementUpstreamError as exc:
        return _upstream(str(exc))
    except Exception:
        logger.exception("Unhandled error on %s", route_label)
        return _internal()
    return not_implemented_response(route_label)


# SAM / local alias
lambda_handler = handler
