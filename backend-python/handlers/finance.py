"""FinanceFunction entrypoint — hour 0-3 stub.

Owns per architecture.md Stack layout:
  /portfolio/*, /securities/*, /fire/*, /net-worth*,
  /loans/emi, /loans/prepayment-impact,
  /statements/*, /cashflow/*, /calculators/*

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

# (method, path-regex) — path regexes anchored. Instrument keys stay in
# query string per api-contract.md, never path params.
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


# SAM / local alias
lambda_handler = handler
