"""Tier-A real-tool adapters. No stubs, no unshipped domains.

Every tool reads identity only from tool_context.invocation_state["user_id"]
(the model never sees or supplies it), reuses the shipped deterministic
engines/routes, returns {ok, data, source, as_of, assumptions, warnings} or
{ok:false, error_code, message}, and converts paise to _inr at this boundary.
"""

from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any

try:  # Strands layer on Lambda; shim locally so unit tests run without it.
    from strands import tool
except Exception:  # pragma: no cover

    def tool(*dargs, **dkwargs):
        def wrap(fn):
            fn._tool_shim = True
            return fn

        if dargs and callable(dargs[0]) and len(dargs) == 1 and not dkwargs:
            return dargs[0]
        return wrap


TOOL_CAP = 30

SAFE_ACTION_ENTITIES = frozenset({
    "profile", "dashboard_financials", "holding", "goal", "loan",
    "fire_scenario", "transaction_category",
})
SAFE_ACTION_OPERATIONS = frozenset({"create", "update", "delete"})
_IDENTITY_FIELDS = frozenset({
    "user_id", "account_id", "account_number", "account_no", "customer_id",
    "email", "phone", "mobile", "cognito_sub", "sub", "token", "secret",
    "password", "authorization", "access_token", "refresh_token",
})
_MAX_METADATA_STRING = 500
_SUSPICIOUS_VALUE = re.compile(r"(?:api[_ -]?key|private[_ -]?key|secret|password|authorization|access[_ -]?token|refresh[_ -]?token|account[_ -]?(?:number|no|id))\s*[:=]|\b\d{8,}\b", re.IGNORECASE)
_RAW_FIELDS = frozenset({"result", "raw", "output", "response", "toolresult", "tooloutput"})


def _normalized_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


def _safe_string(value: str, *, field: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > _MAX_METADATA_STRING:
        raise ValueError(f"invalid metadata {field}")
    if any(ord(char) < 32 and char not in "\t\n" for char in value):
        raise ValueError(f"invalid metadata {field}")
    if _SUSPICIOUS_VALUE.search(value):
        raise ValueError("metadata contains sensitive or account-like content")
    return value.strip()


def _assert_safe_metadata(value: Any) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str):
                raise ValueError("metadata contains an account identity field")
            normalized = _normalized_key(key)
            if (normalized in {_normalized_key(item) for item in _IDENTITY_FIELDS}
                    or normalized in _RAW_FIELDS
                    or any(part in normalized for part in ("userid", "account", "email", "phone", "token", "secret", "password", "privatekey"))):
                raise ValueError("metadata contains an account identity field")
            _assert_safe_metadata(child)
    elif isinstance(value, list):
        if len(value) > 50:
            raise ValueError("metadata list is too large")
        for child in value:
            _assert_safe_metadata(child)
    elif isinstance(value, str):
        _safe_string(value, field="value")
    elif value is not None and not isinstance(value, (bool, int, float)):
        raise ValueError("metadata value has an unsupported type")


def record_activity(tool_name: str, status: str) -> dict:
    """Build the small, UI-safe tool activity record persisted on a chat job."""
    tool_name = _safe_string(tool_name, field="tool")
    try:
        registered = get_tool_registry()
    except NameError:  # pragma: no cover
        registered = {}
    if tool_name not in registered:
        raise ValueError("unknown tool activity")
    if status not in {"started", "completed", "failed"}:
        raise ValueError("invalid tool activity status")
    return {"tool": tool_name.strip(), "status": status}


def record_citation(source: str, as_of: str, title: str | None = None) -> dict:
    """Build a citation without retaining a raw tool response or account data."""
    source = _safe_string(source, field="source")
    as_of = _safe_string(as_of, field="as_of")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:T[^\s]{1,30})?", as_of):
        raise ValueError("citation date must be ISO formatted")
    result = {"source": source, "as_of": as_of}
    if title is not None:
        result["title"] = _safe_string(title, field="title")
    _assert_safe_metadata(result)
    return result


@tool
def propose_action(entity: str, operation: str, *, target: str | None = None,
                   payload: dict | None = None) -> dict:
    """Validate a proposal; proposals are metadata only and are never persisted as writes."""
    if entity not in SAFE_ACTION_ENTITIES:
        raise ValueError("unsupported action entity")
    if operation not in SAFE_ACTION_OPERATIONS:
        raise ValueError("unsupported action operation")
    if operation == "create" and target is not None:
        raise ValueError("create actions cannot have a target")
    if operation in {"update", "delete"} and (not isinstance(target, str) or not target.strip()):
        raise ValueError("update/delete actions require a target")
    if operation in {"create", "update"} and (not isinstance(payload, dict) or not payload):
        raise ValueError("create/update actions require a payload")
    if target is not None:
        target = _safe_string(target, field="target")
    if payload is not None:
        _assert_safe_metadata(payload)
    result = {"entity": entity, "operation": operation}
    if target is not None:
        result["target"] = target.strip()
    if payload is not None:
        result["payload"] = payload
    _assert_safe_metadata(result)
    return result


class ToolCapExceeded(Exception):
    pass


class ToolCallTracker:
    """Deterministic cap: enforced before the model can execute tool 31."""

    def __init__(self, cap: int = TOOL_CAP):
        self.cap = cap
        self.count = 0
        self.calls: list[str] = []

    def record(self, name: str) -> None:
        if self.count >= self.cap:
            raise ToolCapExceeded(f"tool call cap of {self.cap} reached")
        self.count += 1
        self.calls.append(name)


def ok_result(data: dict, source: str, as_of: str,
              assumptions: dict | None = None,
              warnings: list | None = None) -> dict:
    return {
        "ok": True,
        "data": data,
        "source": source,
        "as_of": as_of,
        "assumptions": assumptions or {},
        "warnings": warnings or [],
    }


def err_result(error_code: str, message: str) -> dict:
    return {"ok": False, "error_code": error_code, "message": message}


def paise_to_inr(paise: int | float | None) -> float | None:
    if paise is None:
        return None
    return round(float(paise) / 100.0, 2)


def _rupeeify(value: Any) -> Any:
    """Convert *_paise leaves to *_inr at the tool boundary (one level)."""
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if k.endswith("_paise") and isinstance(v, (int, float)):
                out[k.replace("_paise", "_inr")] = paise_to_inr(v)
            elif isinstance(v, (dict, list)):
                out[k] = _rupeeify(v)
            else:
                out[k] = v
        return out
    if isinstance(value, list):
        return [_rupeeify(v) for v in value]
    return value


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _user_id(tool_context) -> str:
    try:
        return tool_context.invocation_state["user_id"]
    except (KeyError, TypeError, AttributeError) as exc:
        raise PermissionError("missing authenticated user identity") from exc


def _check_cap(tool_context, name: str) -> str:
    """Enforce the 30-call cap INSIDE the tool body, before any data access.

    The 31st call raises ToolCapExceeded here — the runner never records
    stream events into the tracker, so there is no double-counting.
    """
    try:
        tracker = tool_context.invocation_state["tracker"]
    except (KeyError, TypeError, AttributeError) as exc:
        raise PermissionError("missing tool governor") from exc
    if tracker is None:
        raise PermissionError("missing tool governor")
    tracker.record(name)
    return _user_id(tool_context)


def _load_user_data(user_id: str) -> dict:
    """Real DynamoDB reads (Query/GetItem only, env table names)."""
    import os

    import boto3
    from boto3.dynamodb.conditions import Key
    from handlers.finance import plain_numbers

    dynamo = boto3.resource("dynamodb")

    def _query(env_var: str) -> list[dict]:
        table = dynamo.Table(os.environ[env_var])
        items: list[dict] = []
        kwargs: dict = {"KeyConditionExpression": Key("user_id").eq(user_id)}
        while True:
            page = table.query(**kwargs)
            items.extend(page.get("Items", []))
            if "LastEvaluatedKey" not in page:
                break
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        return items

    users_table = dynamo.Table(os.environ["USERS_TABLE"])
    user = users_table.get_item(Key={"user_id": user_id}).get("Item")
    return plain_numbers({
        "user": user,
        "holdings": _query("HOLDINGS_TABLE"),
        "goals": _query("GOALS_TABLE"),
        "loans": _query("LOANS_TABLE"),
        "transactions": _query("TRANSACTIONS_TABLE"),
    })


@tool(context=True)
def get_financial_snapshot(tool_context) -> dict:
    """Profile, net worth, portfolio totals + flags, baseline FIRE, goals, cashflow."""
    user_id = _check_cap(tool_context, "get_financial_snapshot")
    from finance import fire as fire_engine
    from finance import networth as networth_engine
    from finance import portfolio as portfolio_engine
    from handlers.finance import (
        _build_fire_inputs,
        _current_age,
        _fire_goal_inputs,
        _fire_loan_inputs,
        _priced_holdings,
        _today,
        load_user_data,
    )
    from statements.summaries import summarize_transactions


    as_of = _now()
    try:
        data = load_user_data(user_id)
    except Exception:
        data = _load_user_data(user_id)
    user = data.get("user")
    if not user:
        return err_result("NOT_FOUND", "User profile not found")
    priced, warnings = _priced_holdings(data.get("holdings", []), _today())
    portfolio = portfolio_engine.analyze_portfolio(priced)
    liabilities = sum(int(loan.get("outstanding_paise") or 0) for loan in data.get("loans", []))
    totals = networth_engine.calculate_net_worth(
        holdings_value_paise=sum(h["value_paise"] for h in priced if h.get("asset_type") != "FD"),
        fd_accrued_paise=float(sum(h["value_paise"] for h in priced if h.get("asset_type") == "FD")),
        cash_paise=user.get("cash_balance_paise"),
        declared_net_worth_paise=user.get("declared_net_worth_paise"),
        liabilities_paise=liabilities,
        has_holdings=bool(data.get("holdings")),
    )
    fire_summary = None
    current_age = _current_age(user, {})
    if current_age is not None:
        try:
            fire_summary = fire_engine.calculate_fire(_build_fire_inputs(data, {}, current_age))
        except Exception:
            warnings.append("FIRE baseline unavailable.")
    cashflow = None
    try:
        from statements.dto import TransactionDTO

        rows = [
            TransactionDTO(
                txn_id=str(r.get("txn_id") or "x"), txn_date=str(r["txn_date"]),
                description=str(r.get("description") or ""),
                amount_paise=int(r["amount_paise"]), direction=str(r["direction"]),
                category=r.get("category"), category_source=r.get("category_source"),
            )
            for r in data.get("transactions", [])
        ]
        cashflow = summarize_transactions(rows)
    except Exception:
        cashflow = None
    return ok_result(_rupeeify({
        "portfolio": portfolio, "net_worth": totals,
        "fire": {"fire_age": (fire_summary or {}).get("fire_age")},
        "goal_count": len(data.get("goals", [])),
        "cashflow": cashflow,
    }), source="holdings", as_of=as_of, warnings=warnings)


@tool(context=True)
def get_portfolio_analysis(tool_context) -> dict:
    """Reuse the current deterministic portfolio route/service."""
    user_id = _check_cap(tool_context, "get_portfolio_analysis")
    from finance import portfolio as portfolio_engine
    from handlers.finance import _priced_holdings, _today, load_user_data


    as_of = _now()
    try:
        data = load_user_data(user_id)
    except Exception:
        data = _load_user_data(user_id)
    priced, warnings = _priced_holdings(data.get("holdings", []), _today())
    result = portfolio_engine.analyze_portfolio(priced)
    return ok_result(_rupeeify(result), source="MANUAL", as_of=as_of, warnings=warnings)


@tool(context=True)
def get_goals(tool_context) -> dict:
    """Read authenticated goals."""
    user_id = _check_cap(tool_context, "get_goals")
    from handlers.finance import load_user_data


    try:
        data = load_user_data(user_id)
    except Exception:
        data = _load_user_data(user_id)
    return ok_result(_rupeeify({"goals": data.get("goals", [])}),
                     source="goals", as_of=_now())


@tool(context=True)
def calculate_fire(tool_context) -> dict:
    """Reuse the existing FIRE engine/input conventions (all overrides optional)."""
    user_id = _check_cap(tool_context, "calculate_fire")
    from finance import fire as fire_engine
    from handlers.finance import _build_fire_inputs, _current_age, load_user_data


    try:
        data = load_user_data(user_id)
    except Exception:
        data = _load_user_data(user_id)
    user = data.get("user")
    if not user:
        return err_result("NOT_FOUND", "User profile not found")
    current_age = _current_age(user, {})
    if current_age is None:
        return err_result("VALIDATION_ERROR", "current_age or date_of_birth required")
    try:
        result = fire_engine.calculate_fire(_build_fire_inputs(data, {}, current_age))
    except Exception:
        return err_result("INTERNAL", "FIRE calculation is unavailable right now.")
    return ok_result(_rupeeify(result), source="fire-engine", as_of=_now(),
                     assumptions=result.get("assumptions"), warnings=result.get("warnings"))


@tool(context=True)
def simulate_goal_impact(tool_context, goal_type: str = "OTHER",
                         amount_today_inr: float = 0,
                         target_age: int = 0) -> dict:
    """Reuse existing FIRE goal-impact input conventions."""
    user_id = _check_cap(tool_context, "simulate_goal_impact")
    from finance import fire as fire_engine
    from handlers.finance import _build_fire_inputs, _current_age, load_user_data


    try:
        data = load_user_data(user_id)
    except Exception:
        data = _load_user_data(user_id)
    user = data.get("user")
    if not user:
        return err_result("NOT_FOUND", "User profile not found")
    current_age = _current_age(user, {})
    if current_age is None:
        return err_result("VALIDATION_ERROR", "current_age or date_of_birth required")
    goal = {"goal_type": goal_type,
            "amount_today_paise": int(round(float(amount_today_inr) * 100)),
            "target_age": int(target_age)}
    try:
        result = fire_engine.simulate_goal_impact(_build_fire_inputs(data, {}, current_age), goal)
    except Exception:
        return err_result("INTERNAL", "Goal-impact calculation is unavailable right now.")
    return ok_result(_rupeeify(result), source="fire-engine", as_of=_now())


@tool(context=True)
def get_net_worth(tool_context) -> dict:
    """Reuse existing net-worth engine/input conventions."""
    user_id = _check_cap(tool_context, "get_net_worth")
    from finance import networth as networth_engine
    from handlers.finance import _monthly_emi_paise, _priced_holdings, _today, load_user_data


    try:
        data = load_user_data(user_id)
    except Exception:
        data = _load_user_data(user_id)
    user = data.get("user")
    if not user:
        return err_result("NOT_FOUND", "User profile not found")
    priced, warnings = _priced_holdings(data.get("holdings", []), _today())
    holdings_value = sum(h["value_paise"] for h in priced if h.get("asset_type") != "CASH")
    fd_value = sum(h["value_paise"] for h in priced if h.get("asset_type") == "FD")
    totals = networth_engine.calculate_net_worth(
        holdings_value_paise=holdings_value - fd_value,
        fd_accrued_paise=float(fd_value),
        cash_paise=user.get("cash_balance_paise"),
        declared_net_worth_paise=user.get("declared_net_worth_paise"),
        liabilities_paise=sum(int(l.get("outstanding_paise") or 0) for l in data.get("loans", [])),
        has_holdings=bool(data.get("holdings")),
    )
    return ok_result(_rupeeify(totals), source="holdings" if data.get("holdings") else "declared",
                     as_of=_now(), warnings=warnings)


@tool(context=True)
def project_net_worth(tool_context, years: int = 30) -> dict:
    """Reuse existing net-worth projection input conventions."""
    user_id = _check_cap(tool_context, "project_net_worth")
    from finance import fire as fire_engine
    from finance import networth as networth_engine
    from handlers.finance import (_build_fire_inputs, _current_age, _fire_goal_inputs,
                                  _fire_loan_inputs, _priced_holdings, _today, load_user_data)


    years = int(years or 30)
    if not 1 <= years <= 80:
        return err_result("VALIDATION_ERROR", "years must be between 1 and 80")
    try:
        data = load_user_data(user_id)
    except Exception:
        data = _load_user_data(user_id)
    user = data.get("user")
    if not user:
        return err_result("NOT_FOUND", "User profile not found")
    current_age = _current_age(user, {})
    if current_age is None:
        return err_result("VALIDATION_ERROR", "date_of_birth required")
    priced, warnings = _priced_holdings(data.get("holdings", []), _today())
    invested = sum(h["value_paise"] for h in priced if h.get("asset_type") != "CASH")
    fire_inputs = _build_fire_inputs(data, {}, current_age)
    fire_result = fire_engine.calculate_fire(fire_inputs)
    curve = networth_engine.project_net_worth({
        "current_age": current_age, "current_invested_paise": invested,
        "monthly_expenses_paise": user.get("monthly_expenses_paise") or 0,
        "monthly_investment_paise": user.get("monthly_investment_paise") or 0,
        "goals": _fire_goal_inputs(data.get("goals", [])),
        "loans": _fire_loan_inputs(data.get("loans", []), current_age),
        "fire_age": fire_result["fire_age"],
    }, years=years)
    return ok_result(_rupeeify({"curve": curve, "fire_age": fire_result["fire_age"]}),
                     source="networth-engine", as_of=_now(),
                     assumptions=fire_result.get("assumptions"),
                     warnings=warnings + fire_result.get("warnings", []))


@tool(context=True)
def get_cashflow_summary(tool_context) -> dict:
    """Reuse current statement summary implementation."""
    user_id = _check_cap(tool_context, "get_cashflow_summary")
    from handlers.finance import load_user_data
    from statements.dto import TransactionDTO
    from statements.summaries import summarize_transactions


    try:
        data = load_user_data(user_id)
    except Exception:
        data = _load_user_data(user_id)
    rows = []
    for r in data.get("transactions", []):
        try:
            rows.append(TransactionDTO(
                txn_id=str(r.get("txn_id") or "x"), txn_date=str(r["txn_date"]),
                description=str(r.get("description") or ""),
                amount_paise=int(r["amount_paise"]), direction=str(r["direction"]),
                category=r.get("category"), category_source=r.get("category_source"),
            ))
        except Exception:
            continue
    return ok_result(_rupeeify(summarize_transactions(rows)),
                     source="transactions", as_of=_now())


def get_tool_registry() -> dict:
    return {
        "get_financial_snapshot": get_financial_snapshot,
        "get_portfolio_analysis": get_portfolio_analysis,
        "get_goals": get_goals,
        "calculate_fire": calculate_fire,
        "simulate_goal_impact": simulate_goal_impact,
        "get_net_worth": get_net_worth,
        "project_net_worth": project_net_worth,
        "get_cashflow_summary": get_cashflow_summary,
        "propose_action": propose_action,
    }
