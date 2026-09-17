"""AgentFunction entrypoint — hour 0-3 stub.

Owns per architecture.md Stack layout (async, 300s, Strands layer):
  POST /chat, GET /chat/{job_id}, GET /conversations*

No business logic yet. Every known route returns 501.
Auth plumbing is real: Cognito sub extracted via handlers.auth.
"""

from __future__ import annotations

import re

from .auth import (
    UnauthorizedError,
    get_authenticated_user_id,
    not_implemented_response,
    unauthorized_response,
)

ROUTES: list[tuple[str, str]] = [
    ("GET", r"/chat/[^/]+"),
    ("GET", r"/conversations"),
    ("GET", r"/conversations/[^/]+/messages"),
]


def _method_and_path(event: dict) -> tuple[str, str]:
    http = (event.get("requestContext") or {}).get("http") or {}
    method = http.get("method") or event.get("httpMethod", "")
    path = http.get("path") or event.get("rawPath") or event.get("path", "")
    return method.upper(), path


def handler(event: dict, context) -> dict:
    try:
        get_authenticated_user_id(event)
    except UnauthorizedError:
        return unauthorized_response()

    method, path = _method_and_path(event)
    route_label = f"{method} {path}"
    for route_method, pattern in ROUTES:
        if method == route_method and re.fullmatch(pattern, path):
            return not_implemented_response(route_label)

    import json

    return {
        "statusCode": 404,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {"error": {"code": "NOT_FOUND", "message": f"Unknown route {route_label}"}}
        ),
    }


lambda_handler = handler
