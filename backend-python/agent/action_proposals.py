"""Validated, write-free previews for user-requested account edits.

These helpers deliberately return metadata only. Persistence is owned by the
authenticated CRUD routes after an explicit user confirmation.
"""

from __future__ import annotations

from typing import Any


def _preview(entity: str, operation: str, *, target: str | None = None,
             payload: dict[str, Any] | None = None, tool_context=None) -> dict:
    from agent.tools import validate_stored_action

    result = validate_stored_action(entity, operation, target=target, payload=payload)
    result["preview"] = True
    result["requires_confirmation"] = True
    return result


def propose_profile_update(payload: dict, *, tool_context=None) -> dict:
    return _preview("profile", "update", target="profile", payload=payload, tool_context=tool_context)


def propose_dashboard_preferences(payload: dict, *, tool_context=None) -> dict:
    return _preview("dashboard_financials", "update", target="dashboard", payload=payload, tool_context=tool_context)


def propose_holding_update(target: str, payload: dict, *, tool_context=None) -> dict:
    return _preview("holding", "update", target=target, payload=payload, tool_context=tool_context)


def propose_holdings_update(target: str, payload: dict, *, tool_context=None) -> dict:
    return propose_holding_update(target, payload, tool_context=tool_context)


def propose_goal_update(target: str, payload: dict, *, tool_context=None) -> dict:
    return _preview("goal", "update", target=target, payload=payload, tool_context=tool_context)


def propose_loan_update(target: str, payload: dict, *, tool_context=None) -> dict:
    return _preview("loan", "update", target=target, payload=payload, tool_context=tool_context)


def propose_fire_scenario(payload: dict, *, tool_context=None) -> dict:
    return _preview("fire_scenario", "create", payload=payload, tool_context=tool_context)


def propose_transaction_category_change(target: str, category: str, *, tool_context=None) -> dict:
    return _preview("transaction_category", "update", target=target,
                    payload={"category": category}, tool_context=tool_context)
