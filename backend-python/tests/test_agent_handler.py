import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_get_chat_job_returns_safe_metadata_fields(monkeypatch):
    import handlers.agent as handler

    class Table:
        def get_item(self, Key):
            return {"Item": {
                "user_id": "user-a", "job_id": Key["job_id"], "conversation_id": "c1",
                "status": "COMPLETED", "answer": "grounded",
                "tool_activity": [{"tool": "get_net_worth", "status": "completed"}],
                "citations": [{"source": "holdings", "as_of": "2026-09-20"}],
                "proposed_actions": [{"entity": "goal", "operation": "create", "payload": {"name": "car"}}],
            }}

    monkeypatch.setattr(handler, "_chat_jobs_table", lambda: Table())
    result = handler.get_chat_job_route("user-a", "job-1")
    body = json.loads(result["body"])
    assert body["tool_activity"][0]["tool"] == "get_net_worth"
    assert body["citations"][0]["source"] == "holdings"
    assert body["proposed_actions"][0]["operation"] == "create"
    assert "user_id" not in json.dumps(body)
