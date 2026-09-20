"""Conversation/job persistence. Query/GetItem only, never Scan.

Table key shapes from infra/template.yaml + api-contract.md:
- conversations: PK user_conv = f"{user_id}#{conversation_id}", SK msg_sk
- chat-jobs:     PK user_id, SK job_id
Table names only from env vars.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone


def conversations_table_name() -> str:
    return os.environ["CONVERSATIONS_TABLE"]


def chat_jobs_table_name() -> str:
    return os.environ["CHAT_JOBS_TABLE"]


def _dynamodb():
    import boto3

    return boto3.resource("dynamodb")


def get_conversations_table():
    return _dynamodb().Table(conversations_table_name())


def get_chat_jobs_table():
    return _dynamodb().Table(chat_jobs_table_name())


def user_conv_key(user_id: str, conversation_id: str) -> str:
    return f"{user_id}#{conversation_id}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- chat jobs ----------

def create_chat_job(table, user_id: str, job_id: str,
                    conversation_id: str, message: str) -> dict:
    now = _now()
    job = {
        "user_id": user_id,
        "job_id": job_id,
        "conversation_id": conversation_id,
        "status": "QUEUED",
        "message": message,
        "tool_calls": [],
        "tool_activity": [],
        "citations": [],
        "proposed_actions": [],
        "created_at": now,
        "updated_at": now,
    }
    table.put_item(Item=job, ConditionExpression="attribute_not_exists(job_id)")
    return job


def get_chat_job(table, user_id: str, job_id: str) -> dict | None:
    res = table.get_item(Key={"user_id": user_id, "job_id": job_id})
    item = res.get("Item")
    if not item or item.get("user_id") != user_id:
        return None
    return item


def update_chat_job(table, user_id: str, job_id: str, status: str, **fields) -> dict:
    job = get_chat_job(table, user_id, job_id) or {
        "user_id": user_id, "job_id": job_id,
    }
    job.update({"status": status, "updated_at": _now(), **fields})
    table.put_item(Item=job)
    return job


# ---------- conversation messages ----------

def save_message(table, user_id: str, conversation_id: str, role: str,
                 content: str, tools_used: list | None = None) -> dict:
    """Assistant rows store tools_used, never raw tool output."""
    now = _now()
    row = {
        "user_conv": user_conv_key(user_id, conversation_id),
        "msg_sk": f"{now}#{uuid.uuid4().hex[:8]}",
        "role": role,
        "content": content,
        "tools_used": tools_used or [],
        "created_at": now,
    }
    table.put_item(Item=row)
    return row


def get_history(table, user_id: str, conversation_id: str, limit: int = 10) -> list[dict]:
    """Last `limit` turns via Query on the partition key. Never Scan."""
    from boto3.dynamodb.conditions import Key

    page = table.query(
        KeyConditionExpression=Key("user_conv").eq(user_conv_key(user_id, conversation_id))
    )
    items = sorted(page.get("Items", []), key=lambda r: r.get("msg_sk", ""))
    owned = [r for r in items
             if str(r.get("user_conv", "")).startswith(f"{user_id}#")]
    return owned[-limit:]


def list_messages(table, user_id: str, conversation_id: str) -> list[dict]:
    from boto3.dynamodb.conditions import Key

    page = table.query(
        KeyConditionExpression=Key("user_conv").eq(user_conv_key(user_id, conversation_id))
    )
    items = sorted(page.get("Items", []), key=lambda r: r.get("msg_sk", ""))
    return [r for r in items if r.get("user_conv") == user_conv_key(user_id, conversation_id)]
