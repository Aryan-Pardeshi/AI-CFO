import json
import os
import sys

import pytest

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
                "proposed_actions": [{"entity": "goal", "operation": "create", "payload": {"name": "car"}, "expires_at": "2099-01-01T00:00:00Z"}],
            }}

    monkeypatch.setattr(handler, "_chat_jobs_table", lambda: Table())
    result = handler.get_chat_job_route("user-a", "job-1")
    body = json.loads(result["body"])
    assert body["tool_activity"][0]["tool"] == "get_net_worth"
    assert body["citations"][0]["source"] == "holdings"
    assert body["proposed_actions"][0]["operation"] == "create"
    assert body["proposed_actions"][0]["expires_at"] == "2099-01-01T00:00:00Z"
    assert "user_id" not in json.dumps(body)


def test_get_chat_job_fails_closed_on_malformed_stored_metadata(monkeypatch):
    import handlers.agent as handler

    class Table:
        def get_item(self, Key):
            return {"Item": {"user_id": "user-a", "job_id": Key["job_id"],
                              "conversation_id": "c1", "status": "COMPLETED",
                              "tool_activity": [{"tool": "made_up_tool", "status": "started"}]}}

    monkeypatch.setattr(handler, "_chat_jobs_table", lambda: Table())
    result = handler.get_chat_job_route("user-a", "job-1")
    assert result["statusCode"] == 500
    assert "tool_activity" not in json.loads(result["body"])


def test_get_chat_job_preserves_firecrawl_citation_fields(monkeypatch):
    """Research citations keep their safe id/url/domain through GET /chat/{job_id}."""
    import handlers.agent as handler

    stored = [
        {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20T10:00:00Z",
         "title": "RBI rules", "domain": "rbi.org.in", "url": "https://rbi.org.in/rules"},
        {"id": "user-url", "source": "Firecrawl", "as_of": "2026-09-20T10:00:01Z",
         "url": "https://rbi.org.in/faq"},
        {"source": "holdings", "as_of": "2026-09-20"},
    ]

    class Table:
        def get_item(self, Key):
            return {"Item": {"user_id": "user-a", "job_id": Key["job_id"],
                              "conversation_id": "c1", "status": "COMPLETED",
                              "answer": "grounded", "citations": stored}}

    monkeypatch.setattr(handler, "_chat_jobs_table", lambda: Table())
    result = handler.get_chat_job_route("user-a", "job-1")
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["citations"] == stored


@pytest.mark.parametrize("citation", [
    {"source": "Firecrawl", "as_of": "2026-09-20T10:00:00Z", "url": "https://rbi.org.in/rules"},
    {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20T10:00:00Z"},
    {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20T10:00:00Z", "url": "javascript:alert(1)"},
    {"id": "r1", "source": "Firecrawl", "as_of": "yesterday", "url": "https://rbi.org.in/rules"},
    {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20", "url": "https://rbi.org.in/rules",
     "result": {"markdown": "raw page"}},
    {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20", "url": "https://rbi.org.in/rules",
     "title": "complete tool output holdings"},
])
def test_get_chat_job_fails_closed_on_unsafe_stored_citations(monkeypatch, citation):
    import handlers.agent as handler

    class Table:
        def get_item(self, Key):
            return {"Item": {"user_id": "user-a", "job_id": Key["job_id"],
                              "conversation_id": "c1", "status": "COMPLETED",
                              "citations": [citation]}}

    monkeypatch.setattr(handler, "_chat_jobs_table", lambda: Table())
    result = handler.get_chat_job_route("user-a", "job-1")
    assert result["statusCode"] == 500
    assert "citations" not in json.loads(result["body"])
