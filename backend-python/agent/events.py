"""AppSync Events publish — best-effort only. Polling stays authoritative."""

from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger(__name__)


def channel_for(user_id: str, job_id: str) -> str:
    return f"/jobs/{user_id}/{job_id}"


def publish_job_event(channel: str, event_type: str, payload: dict | None = None) -> bool:
    """Publish a safe progress event (tool_start/tool_end/completion/failure).

    Never raises: Events failures must not break polling. Returns True if a
    publish was attempted and acknowledged.
    """
    endpoint = os.environ.get("EVENTS_HTTP_ENDPOINT")
    if not endpoint:
        return False
    try:
        import boto3
        import botocore.auth
        import botocore.awsrequest
        import urllib.request
        from botocore.credentials import create_credential_resolver

        body = json.dumps({"channel": channel,
                           "events": [json.dumps({"type": event_type,
                                                  **(payload or {})})]}).encode()
        url = f"https://{endpoint}/event"
        request = botocore.awsrequest.AWSRequest(method="POST", url=url, data=body,
                                                headers={"Content-Type": "application/json"})
        session = boto3.Session()
        creds = session.get_credentials()
        if creds is None:
            return False
        signer = botocore.auth.SigV4Auth(creds, "appsync", session.region_name or "ap-south-1")
        signer.add_auth(request)
        req = urllib.request.Request(url, data=body, headers=dict(request.headers))
        with urllib.request.urlopen(req, timeout=5) as resp:
            return 200 <= resp.status < 300
    except Exception:
        logger.warning("appsync publish failed for %s", event_type)
        return False
