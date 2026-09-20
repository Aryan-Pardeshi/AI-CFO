"""Tier-A real-tool adapters. No stubs, no unshipped domains.

Every tool reads identity only from tool_context.invocation_state["user_id"]
(the model never sees or supplies it), reuses the shipped deterministic
engines/routes, returns {ok, data, source, as_of, assumptions, warnings} or
{ok:false, error_code, message}, and converts paise to _inr at this boundary.
"""

from __future__ import annotations

from datetime import datetime, timezone
import math
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
_SUSPICIOUS_VALUE = re.compile(r"(?:api[_ -]?key|private[_ -]?key|secret|password|authorization|access[_ -]?token|refresh[_ -]?token|account[_ -]?(?:number|no|id))|\b\d{8,}\b", re.IGNORECASE)
_RAW_FIELDS = frozenset({"result", "raw", "output", "response", "toolresult", "tooloutput"})
_KNOWN_CITATION_SOURCES = frozenset({"holdings", "goals", "fire-engine", "networth-engine", "transactions", "MANUAL", "Firecrawl", "Upstox", "mfapi"})
_KNOWN_CITATION_DOMAINS = frozenset({"rbi.org.in", "sebi.gov.in", "incometax.gov.in", "amfiindia.com", "upstox.com", "mfapi.in"})
_RAW_MARKERS = re.compile(r"\b(?:tool|output|result|holding|allocation|response|raw)\b", re.IGNORECASE)
_RAW_OUTPUT_MARKERS = re.compile(
    r"\b(?:raw[\s_-]+(?:tool[\s_-]+)?|tool[\s_-]+|complete[\s_-]+)(?:output|result|response)s?\b",
    re.IGNORECASE,
)
_ACTION_FIELDS = {
    "profile": {"name", "date_of_birth", "base_currency", "monthly_income_paise", "monthly_expenses_paise", "monthly_investment_paise", "declared_net_worth_paise", "cash_balance_paise", "emergency_fund_target_months", "risk_profile", "risk_score", "investment_horizon_years", "strategy_goal", "dependents_count", "employment_type", "city_tier", "onboarded"},
    "dashboard_financials": {"monthly_income_paise", "monthly_expenses_paise", "monthly_investment_paise", "cash_balance_paise", "declared_net_worth_paise"},
    "holding": {"asset_type", "source", "instrument_key", "symbol", "isin", "name", "quantity", "avg_buy_price_paise", "first_buy_date", "manual_current_value_paise", "sector", "sip_monthly_paise", "fd_type", "fd_principal_paise", "fd_annual_rate", "fd_start_date", "fd_maturity_date"},
    "goal": {"name", "goal_type", "amount_today_paise", "target_age", "inflation_rate"},
    "loan": {"name", "loan_type", "outstanding_paise", "annual_rate", "tenure_months", "prepayment_charge_pct", "rate_type"},
    "fire_scenario": {"goal_type", "amount_today_paise", "target_age"},
    "transaction_category": {"category"},
}
_PAISE_FIELDS = {field for fields in _ACTION_FIELDS.values() for field in fields if field.endswith("_paise")}
_RATIO_FIELDS = {"annual_rate", "fd_annual_rate", "inflation_rate", "prepayment_charge_pct"}
_INT_RANGES = {"target_age": (18, 91), "tenure_months": (1, 480), "emergency_fund_target_months": (0, 120), "investment_horizon_years": (1, 91), "dependents_count": (0, 20), "risk_score": (4, 12)}


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


def _validate_action_payload(entity: str, payload: dict, *, allow_name: bool = False) -> dict:
    if any(not isinstance(key, str) or key not in _ACTION_FIELDS[entity] for key in payload):
        raise ValueError("unsupported proposal payload field")
    if any(isinstance(value, (dict, list)) for value in payload.values()):
        raise ValueError("nested proposal payloads are not supported")
    for key, value in payload.items():
        if key in _PAISE_FIELDS or key in _INT_RANGES:
            if not isinstance(value, int) or isinstance(value, bool):
                raise ValueError("proposal numeric field must be an integer")
            if value < 0 or (key in _INT_RANGES and not _INT_RANGES[key][0] <= value <= _INT_RANGES[key][1]):
                raise ValueError("proposal numeric field is out of range")
        elif key in _RATIO_FIELDS:
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 0.36:
                raise ValueError("proposal rate is out of range")
        elif key == "onboarded":
            if not isinstance(value, bool):
                raise ValueError("onboarded must be boolean")
        elif key == "quantity":
            if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
                raise ValueError("quantity must be numeric")
        elif not isinstance(value, str):
            raise ValueError("proposal label must be a string")
        elif key.endswith("_date") or key == "date_of_birth":
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                raise ValueError("proposal date must be ISO formatted")
        else:
            _safe_string(value, field=key)
            if _RAW_OUTPUT_MARKERS.search(value):
                raise ValueError("proposal label contains raw-output markers")
            if key == "name" and not allow_name:
                raise ValueError("free-text action names require the current user message")
    return payload


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


def record_citation(source: str, as_of: str, title: str | None = None,
                    *, domain: str | None = None, url: str | None = None) -> dict:
    """Build a citation without retaining a raw tool response or account data."""
    source = _safe_string(source, field="source")
    if source not in _KNOWN_CITATION_SOURCES:
        raise ValueError("unknown citation source")
    as_of = _safe_string(as_of, field="as_of")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:T[^\s]{1,30})?", as_of):
        raise ValueError("citation date must be ISO formatted")
    result = {"source": source, "as_of": as_of}
    if title is not None:
        title = _safe_string(title, field="title")
        if _RAW_MARKERS.search(title):
            raise ValueError("citation title contains raw-output markers")
        result["title"] = title
    if domain is not None:
        domain = _safe_string(domain, field="domain")
        if not re.fullmatch(r"[A-Za-z0-9.-]{1,100}", domain) or "." not in domain or domain.lower() not in _KNOWN_CITATION_DOMAINS:
            raise ValueError("citation domain is invalid")
        result["domain"] = domain.lower()
    if url is not None:
        url = _safe_string(url, field="url")
        if not re.fullmatch(r"https://[A-Za-z0-9.-]{1,100}(?:/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]{0,180})?", url):
            raise ValueError("citation URL is invalid")
        result["url"] = url
    _assert_safe_metadata(result)
    return result


def _validate_proposal(entity: str, operation: str, *, target: str | None = None,
                       payload: dict | None = None, current_message: str | None = None,
                       require_user_text: bool = True) -> dict:
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
        if "name" in payload and require_user_text:
            name = payload["name"]
            if not isinstance(current_message, str) or not current_message.strip() or name.casefold() not in current_message.casefold():
                raise ValueError("free-text action name is not from the current user message")
        _validate_action_payload(entity, payload, allow_name=not require_user_text or "name" in payload)
        _assert_safe_metadata(payload)
    result = {"entity": entity, "operation": operation}
    if target is not None:
        result["target"] = target.strip()
    if payload is not None:
        result["payload"] = payload
    _assert_safe_metadata(result)
    return result


@tool(context=True)
def propose_action(entity: str, operation: str, *, target: str | None = None,
                   payload: dict | None = None, tool_context=None) -> dict:
    current_message = (getattr(tool_context, "invocation_state", {}) or {}).get("message")
    return _validate_proposal(entity, operation, target=target, payload=payload,
                              current_message=current_message, require_user_text=True)


def validate_stored_action(entity: str, operation: str, *, target: str | None = None,
                           payload: dict | None = None) -> dict:
    """Revalidate persisted metadata without treating storage as a user turn."""
    return _validate_proposal(entity, operation, target=target, payload=payload,
                              require_user_text=False)


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


def _inr_paise(value: Any, *, nonnegative: bool = True) -> int:
    number = float(value)
    if not math.isfinite(number) or (nonnegative and number < 0):
        raise ValueError("money amount must be finite and non-negative")
    return round(number * 100)


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


def _read_collection(tool_context, name: str, source: str) -> dict:
    user_id = _check_cap(tool_context, name)
    try:
        from handlers.finance import load_user_data
        data = load_user_data(user_id)
    except Exception:
        try:
            data = _load_user_data(user_id)
        except Exception as exc:
            return err_result("UNAVAILABLE", f"{source} data is unavailable right now.")
    if name == "get_profile" and not data.get("user"):
        return err_result("NOT_FOUND", "User profile not found")
    values = data.get(source, []) if source != "profile" else data.get("user")
    if not values and source != "profile":
        return err_result("NOT_FOUND", f"No {source} data found")
    return ok_result(_rupeeify({source: values}), source=source, as_of=_now())


@tool(context=True)
def get_profile(tool_context) -> dict:
    return _read_collection(tool_context, "get_profile", "profile")


@tool(context=True)
def get_holdings(tool_context) -> dict:
    return _read_collection(tool_context, "get_holdings", "holdings")


@tool(context=True)
def get_loans(tool_context) -> dict:
    return _read_collection(tool_context, "get_loans", "loans")


def _calculator_context(tool_context, name: str) -> None:
    _check_cap(tool_context, name)


@tool(context=True)
def calculate_emi(principal_inr: float, annual_rate_pct: float, tenure_months: int, tool_context) -> dict:
    _calculator_context(tool_context, "calculate_emi")
    try:
        principal = float(principal_inr) * 100
        rate = float(annual_rate_pct) / 100
        tenure = int(tenure_months)
        if principal < 0 or rate < 0 or rate > 0.36 or tenure < 1 or tenure > 480:
            raise ValueError
        from handlers.finance import _monthly_emi_paise
        emi = _monthly_emi_paise(principal, rate, tenure)
        return ok_result(_rupeeify({"principal_paise": round(principal), "monthly_emi_paise": round(emi), "tenure_months": tenure}), "loan-engine", _now())
    except (TypeError, ValueError, OverflowError):
        return err_result("VALIDATION_ERROR", "principal, rate, and tenure are invalid")


@tool(context=True)
def calculate_prepayment_impact(principal_inr: float, annual_rate_pct: float,
                                tenure_months: int, prepayment_inr: float,
                                prepayment_charge_pct: float = 0,
                                tool_context=None) -> dict:
    _calculator_context(tool_context, "calculate_prepayment_impact")
    try:
        principal = float(principal_inr) * 100
        prepayment = float(prepayment_inr) * 100
        rate = float(annual_rate_pct) / 100
        tenure = int(tenure_months)
        if principal <= 0 or prepayment < 0 or prepayment >= principal or rate < 0 or tenure < 1 or tenure > 480:
            raise ValueError
        from agent.loan_calculations import prepayment_impact
        result = prepayment_impact(round(principal), rate, tenure, round(prepayment), float(prepayment_charge_pct))
        warnings = result.pop("warnings", [])
        return ok_result(_rupeeify(result), "loan-engine", _now(), warnings=warnings)
    except (TypeError, ValueError, OverflowError):
        return err_result("VALIDATION_ERROR", "loan and prepayment inputs are invalid")


def _run_finance(name: str, func, kwargs: dict, tool_context) -> dict:
    _calculator_context(tool_context, name)
    try:
        result = func(**kwargs)
        warnings = result.get("warnings", []) if isinstance(result, dict) else []
        return ok_result(_rupeeify(result), "finance-engine", _now(), warnings=warnings)
    except (TypeError, ValueError, OverflowError) as exc:
        return err_result("VALIDATION_ERROR", str(exc))


@tool(context=True)
def estimate_income_tax(income_inr: float | None = None, regime: str = "new", tool_context=None) -> dict:
    from finance.tax import estimate_income_tax as fn
    try:
        return _run_finance("estimate_income_tax", fn, {"income_paise": None if income_inr is None else _inr_paise(income_inr), "regime": regime}, tool_context)
    except (TypeError, ValueError, OverflowError):
        return err_result("VALIDATION_ERROR", "income-tax inputs are invalid")


@tool(context=True)
def compare_tax_regimes(income_inr: float | None = None, tool_context=None) -> dict:
    from finance.tax import compare_tax_regimes as fn
    try:
        return _run_finance("compare_tax_regimes", fn, {"income_paise": None if income_inr is None else _inr_paise(income_inr)}, tool_context)
    except (TypeError, ValueError, OverflowError):
        return err_result("VALIDATION_ERROR", "tax inputs are invalid")


@tool(context=True)
def estimate_capital_gains_tax(gain_inr: float, asset_type: str = "LISTED_EQUITY", holding_period_months: int | None = None, tool_context=None) -> dict:
    from finance.tax import estimate_capital_gains_tax as fn
    try:
        return _run_finance("estimate_capital_gains_tax", fn, {"gain_paise": round(float(gain_inr) * 100), "asset_type": asset_type, "holding_period_months": holding_period_months}, tool_context)
    except (TypeError, ValueError, OverflowError):
        return err_result("VALIDATION_ERROR", "capital-gains inputs are invalid")


@tool(context=True)
def estimate_insurance_needs(inputs: dict | None = None, tool_context=None) -> dict:
    from finance.insurance import estimate_insurance_needs as fn
    try:
        values = dict(inputs or {})
        for key in list(values):
            if key.endswith("_inr"):
                values[key[:-4] + "_paise"] = _inr_paise(values.pop(key))
        return _run_finance("estimate_insurance_needs", fn, {"inputs": values}, tool_context)
    except (TypeError, ValueError, OverflowError):
        return err_result("VALIDATION_ERROR", "insurance inputs are invalid")


@tool(context=True)
def calculate_credit_card_payoff(outstanding_inr: float, monthly_interest_pct: float, monthly_payment_inr: float, tool_context=None) -> dict:
    from finance.creditcard import calculate_credit_card_payoff as fn
    try:
        return _run_finance("calculate_credit_card_payoff", fn, {"outstanding_paise": round(float(outstanding_inr) * 100), "monthly_interest_pct": float(monthly_interest_pct), "monthly_payment_paise": round(float(monthly_payment_inr) * 100)}, tool_context)
    except (TypeError, ValueError, OverflowError):
        return err_result("VALIDATION_ERROR", "credit-card inputs are invalid")


@tool(context=True)
def analyze_short_term_fit(price_history: list, horizon_months: int, tool_context=None) -> dict:
    from finance.shortterm import analyze_short_term_fit as fn
    return _run_finance("analyze_short_term_fit", fn, {"price_history": price_history, "horizon_months": horizon_months}, tool_context)


from agent.action_proposals import (
    propose_dashboard_preferences as _propose_dashboard_preferences,
    propose_fire_scenario as _propose_fire_scenario,
    propose_goal_update as _propose_goal_update,
    propose_holding_update as _propose_holding_update,
    propose_holdings_update as _propose_holdings_update,
    propose_loan_update as _propose_loan_update,
    propose_profile_update as _propose_profile_update,
    propose_transaction_category_change as _propose_transaction_category_change,
)

@tool(context=True)
def propose_profile_update(payload: dict, tool_context=None) -> dict:
    _calculator_context(tool_context, "propose_profile_update")
    return _propose_profile_update(payload, tool_context=tool_context)

@tool(context=True)
def propose_dashboard_preferences(payload: dict, tool_context=None) -> dict:
    _calculator_context(tool_context, "propose_dashboard_preferences")
    return _propose_dashboard_preferences(payload, tool_context=tool_context)

@tool(context=True)
def propose_holding_update(target: str, payload: dict, tool_context=None) -> dict:
    _calculator_context(tool_context, "propose_holding_update")
    return _propose_holding_update(target, payload, tool_context=tool_context)

@tool(context=True)
def propose_holdings_update(target: str, payload: dict, tool_context=None) -> dict:
    _calculator_context(tool_context, "propose_holdings_update")
    return _propose_holdings_update(target, payload, tool_context=tool_context)

@tool(context=True)
def propose_goal_update(target: str, payload: dict, tool_context=None) -> dict:
    _calculator_context(tool_context, "propose_goal_update")
    return _propose_goal_update(target, payload, tool_context=tool_context)

@tool(context=True)
def propose_loan_update(target: str, payload: dict, tool_context=None) -> dict:
    _calculator_context(tool_context, "propose_loan_update")
    return _propose_loan_update(target, payload, tool_context=tool_context)

@tool(context=True)
def propose_fire_scenario(payload: dict, tool_context=None) -> dict:
    _calculator_context(tool_context, "propose_fire_scenario")
    return _propose_fire_scenario(payload, tool_context=tool_context)

@tool(context=True)
def propose_transaction_category_change(target: str, category: str, tool_context=None) -> dict:
    _calculator_context(tool_context, "propose_transaction_category_change")
    return _propose_transaction_category_change(target, category, tool_context=tool_context)


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
        "get_profile": get_profile,
        "get_holdings": get_holdings,
        "get_loans": get_loans,
        "calculate_emi": calculate_emi,
        "calculate_prepayment_impact": calculate_prepayment_impact,
        "estimate_income_tax": estimate_income_tax,
        "compare_tax_regimes": compare_tax_regimes,
        "estimate_capital_gains_tax": estimate_capital_gains_tax,
        "estimate_insurance_needs": estimate_insurance_needs,
        "calculate_credit_card_payoff": calculate_credit_card_payoff,
        "analyze_short_term_fit": analyze_short_term_fit,
        "propose_profile_update": propose_profile_update,
        "propose_dashboard_preferences": propose_dashboard_preferences,
        "propose_holding_update": propose_holding_update,
        "propose_holdings_update": propose_holdings_update,
        "propose_profile_risk_update": propose_profile_update,
        "propose_goal_update": propose_goal_update,
        "propose_loan_update": propose_loan_update,
        "propose_fire_scenario": propose_fire_scenario,
        "propose_transaction_category_change": propose_transaction_category_change,
        "propose_action": propose_action,
    }
