"""Auth helper — single place for Cognito sub extraction.

Exact JWT claims path per architecture.md (HTTP API + Cognito JWT authorizer):
    event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]

Never inline this path elsewhere. Never trust client-supplied user_id.
"""

from __future__ import annotations

import os


class UnauthorizedError(Exception):
    pass


def get_authenticated_user_id(event: dict) -> str:
    """Return verified Cognito sub. Raise UnauthorizedError on missing/invalid JWT."""
    # sam local escape hatch — off in any deployed environment.
    if os.environ.get("AWS_SAM_LOCAL") == "true":
        claims = (
            event.get("requestContext", {})
            .get("authorizer", {})
            .get("jwt", {})
            .get("claims", {})
        )
        sub = claims.get("sub")
        if sub:
            return sub
        return "local-dev-user"

    try:
        sub = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        raise UnauthorizedError("Missing or invalid Authorization token")
    if not sub or not isinstance(sub, str):
        raise UnauthorizedError("Missing or invalid Authorization token")
    return sub


def unauthorized_response():
    import json

    return {
        "statusCode": 401,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {"error": {"code": "UNAUTHORIZED", "message": "Missing or invalid Authorization token"}}
        ),
    }


def not_implemented_response(route: str):
    """Hour 0-3 stub body. Matches api-contract.md error shape."""
    import json

    return {
        "statusCode": 501,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {
                "error": {
                    "code": "NOT_IMPLEMENTED",
                    "message": f"{route} not implemented yet (hour 0-3 stub)",
                }
            }
        ),
    }
