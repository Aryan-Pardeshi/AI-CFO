"""AgentFunction entrypoint.

Two invocation shapes:
1. Async Lambda invoke from FinanceFunction POST /chat — event is the job
   payload {user_id, job_id, conversation_id, message} with no HTTP context.
   Runs the Strands/Bedrock job via agent.runner (owns RUNNING/COMPLETED/FAILED).
2. HTTP via API Gateway (JWT authorizer):
   GET /chat/{job_id}, GET /conversations, GET /conversations/{id}/messages.
   All scoped to the verified Cognito sub; Query/GetItem only, never Scan.
"""

from __future__ import annotations

import json
import logging
import os
import re

from boto3.dynamodb.conditions import Key

from .auth import (
    UnauthorizedError,
    get_authenticated_user_id,
    not_implemented_response,
    unauthorized_response,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

SAFE_CHAT_ERROR = "Unable to complete this chat right now. Please try again."

ROUTES: list[tuple[str, str]] = [
    ("GET", r"/chat/[^/]+"),
    ("GET", r"/conversations"),
    ("GET", r"/conversations/[^/]+/messages"),
]


def _ok(data: dict, status: int = 200) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(data, default=str),
    }


def _err(code: str, message: str, status: int) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": {"code": code, "message": message}}),
    }


_dynamo = None


def _dynamodb():
    global _dynamo
    if _dynamo is None:
        import boto3

        _dynamo = boto3.resource("dynamodb")
    return _dynamo


def _chat_jobs_table():
    name = os.environ.get("CHAT_JOBS_TABLE")
    if not name:
        raise RuntimeError("Missing env var CHAT_JOBS_TABLE")
    return _dynamodb().Table(name)


def _conversations_table():
    name = os.environ.get("CONVERSATIONS_TABLE")
    if not name:
        raise RuntimeError("Missing env var CONVERSATIONS_TABLE")
    return _dynamodb().Table(name)


def _method_and_path(event: dict) -> tuple[str, str]:
    http = (event.get("requestContext") or {}).get("http") or {}
    method = http.get("method") or event.get("httpMethod", "")
    path = http.get("path") or event.get("rawPath") or event.get("path", "")
    return method.upper(), path


def _is_async_job_event(event: dict) -> bool:
    if not isinstance(event, dict):
        return False
    if event.get("requestContext") or event.get("httpMethod") or event.get("rawPath"):
        return False
    return bool(event.get("user_id") and event.get("job_id")
                and event.get("conversation_id") and event.get("message"))


def get_chat_job_route(user_id: str, job_id: str) -> dict:
    item = _chat_jobs_table().get_item(
        Key={"user_id": user_id, "job_id": job_id}
    ).get("Item")
    if not item or item.get("user_id") != user_id:
        return _err("NOT_FOUND", "chat job not found", 404)
    out = {
        "job_id": item.get("job_id"),
        "conversation_id": item.get("conversation_id"),
        "status": item.get("status"),
    }
    if item.get("answer") is not None:
        out["answer"] = item["answer"]
    if item.get("error") is not None:
        out["error"] = SAFE_CHAT_ERROR
    if item.get("tool_calls") is not None:
        out["tool_calls"] = item["tool_calls"]
    try:
        from agent import tools as tools_mod
        out["tool_activity"] = []
        for activity in item.get("tool_activity") or []:
            if not isinstance(activity, dict):
                raise ValueError("invalid tool activity")
            validated = tools_mod.record_activity(activity.get("tool"), activity.get("status"))
            if validated != activity:
                raise ValueError("invalid tool activity shape")
            out["tool_activity"].append(validated)
        out["citations"] = []
        for citation in item.get("citations") or []:
            if not isinstance(citation, dict):
                raise ValueError("invalid citation")
            validated = tools_mod.record_citation(
                citation.get("source"), citation.get("as_of"), citation.get("title"),
                domain=citation.get("domain"), url=citation.get("url"),
                citation_id=citation.get("id"),
            )
            if validated != citation:
                raise ValueError("invalid citation shape")
            out["citations"].append(validated)
        out["proposed_actions"] = []
        for proposal in item.get("proposed_actions") or []:
            if not isinstance(proposal, dict):
                raise ValueError("invalid proposal")
            validated = tools_mod.validate_stored_action(proposal.get("entity"), proposal.get("operation"),
                                                         target=proposal.get("target"), payload=proposal.get("payload"),
                                                         expires_at=proposal.get("expires_at"))
            if validated != proposal:
                raise ValueError("invalid proposal shape")
            out["proposed_actions"].append(validated)
    except (TypeError, ValueError, KeyError):
        return _err("INTERNAL", "chat metadata is unavailable", 500)
    return _ok(out)


def list_conversations_route(user_id: str) -> dict:
    """Conversation ids derived from the caller's own chat-jobs (Query, never Scan)."""
    items: list[dict] = []
    kwargs: dict = {"KeyConditionExpression": Key("user_id").eq(user_id)}
    table = _chat_jobs_table()
    while True:
        page = table.query(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    seen: dict[str, dict] = {}
    for job in items:
        if job.get("user_id") != user_id:
            continue
        conv = job.get("conversation_id")
        if not conv:
            continue
        current = seen.get(conv)
        updated = str(job.get("updated_at") or job.get("created_at") or "")
        if current is None or updated > str(current.get("last_message_at") or ""):
            seen[conv] = {"conversation_id": conv, "last_message_at": updated,
                          "last_status": job.get("status")}
    return _ok({"conversations": list(seen.values())})


def list_messages_route(user_id: str, conversation_id: str) -> dict:
    user_conv = f"{user_id}#{conversation_id}"
    items: list[dict] = []
    kwargs: dict = {"KeyConditionExpression": Key("user_conv").eq(user_conv)}
    table = _conversations_table()
    while True:
        page = table.query(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    owned = [r for r in items if r.get("user_conv") == user_conv]
    owned.sort(key=lambda r: r.get("msg_sk", ""))
    return _ok({
        "conversation_id": conversation_id,
        "messages": [
            {"role": r.get("role"), "content": r.get("content"),
             "tools_used": r.get("tools_used") or [],
             "created_at": r.get("created_at")}
            for r in owned
        ],
    })


def _best_effort_fail_async_job(event: dict, error_class: str) -> None:
    """A last-resort guard: valid queued jobs never remain unresolved."""
    user_id = event.get("user_id")
    job_id = event.get("job_id")
    if not user_id or not job_id:
        return
    try:
        table = _chat_jobs_table()
        item = table.get_item(Key={"user_id": user_id, "job_id": job_id}).get("Item")
        if not item:
            return
        item.update({"status": "FAILED", "error": SAFE_CHAT_ERROR})
        table.put_item(Item=item)
    except Exception as mark_exc:
        logger.info({"event": "async_chat_failure_unpersisted",
                     "error_class": type(mark_exc).__name__,
                     "runner_error_class": error_class})


def handler(event: dict, context) -> dict:
    # Async dispatch from FinanceFunction — no HTTP context, verified-sub payload.
    if _is_async_job_event(event):
        from agent.runner import run_chat_job

        try:
            run_chat_job(event)
        except Exception as exc:
            _best_effort_fail_async_job(event, type(exc).__name__)
            logger.info({"event": "async_chat_job_failed",
                         "error_class": type(exc).__name__})
        return {"status": "ok"}

    try:
        user_id = get_authenticated_user_id(event)
    except UnauthorizedError:
        return unauthorized_response()

    method, path = _method_and_path(event)
    route_label = f"{method} {path}"

    match = re.fullmatch(r"/chat/([^/]+)", path)
    if method == "GET" and match:
        return get_chat_job_route(user_id, match.group(1))
    if method == "GET" and path == "/conversations":
        return list_conversations_route(user_id)
    match = re.fullmatch(r"/conversations/([^/]+)/messages", path)
    if method == "GET" and match:
        return list_messages_route(user_id, match.group(1))

    for route_method, pattern in ROUTES:
        if method == route_method and re.fullmatch(pattern, path):
            return not_implemented_response(route_label)
    return {
        "statusCode": 404,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {"error": {"code": "NOT_FOUND", "message": f"Unknown route {route_label}"}}
        ),
    }


lambda_handler = handler
