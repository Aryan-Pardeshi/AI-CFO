"""Handler tests for POST /chat dispatch and AgentFunction polling/isolation."""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _event(method, path, sub="user-a", body=None):
    event = {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {"jwt": {"claims": {"sub": sub}}},
        },
    }
    if body is not None:
        event["body"] = json.dumps(body)
    return event


class ConditionalCheckFailed(Exception):
    def __init__(self):
        super().__init__("conditional")
        self.response = {"Error": {"Code": "ConditionalCheckFailedException"}}


class FakeTable:
    def __init__(self, store):
        self.store = store
        self.query_calls = []

    def put_item(self, Item, **kwargs):
        key = (Item.get("user_id"), Item.get("job_id"))
        cond = str(kwargs.get("ConditionExpression", ""))
        if "attribute_not_exists" in cond and key in self.store:
            raise ConditionalCheckFailed()
        self.store[key] = Item

    def get_item(self, Key):
        item = self.store.get((Key.get("user_id"), Key.get("job_id")))
        return {"Item": item} if item else {}

    def update_item(self, **kwargs):
        raise NotImplementedError

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        assert "KeyConditionExpression" in kwargs
        return {"Items": []}


def _wire(monkeypatch, chat_store=None):
    import handlers.finance as fin
    import handlers.agent as ag
    store = {} if chat_store is None else chat_store
    monkeypatch.setattr(fin, "_chat_jobs_table", lambda: FakeTable(store))
    monkeypatch.setattr(ag, "_chat_jobs_table", lambda: FakeTable(store))
    monkeypatch.setenv("AGENT_FUNCTION_NAME", "aicfo-dev-agent")
    return fin, ag, store


def test_post_chat_rejects_missing_jwt(monkeypatch):
    import handlers.finance as fin
    event = {"requestContext": {"http": {"method": "POST", "path": "/chat"}},
             "body": json.dumps({"message": "hi"})}
    res = fin.handler(event, None)
    assert res["statusCode"] == 401


@pytest.mark.parametrize("body", [{}, {"message": ""}, {"message": "   "}, {"message": None}])
def test_post_chat_rejects_invalid_empty_message(monkeypatch, body):
    fin, ag, store = _wire(monkeypatch)
    res = fin.handler(_event("POST", "/chat", body=body), None)
    assert res["statusCode"] == 400
    assert json.loads(res["body"])["error"]["code"] == "VALIDATION_ERROR"


def test_post_chat_uses_sub_only_and_invokes_async(monkeypatch):
    fin, ag, store = _wire(monkeypatch)
    invoked = {}

    class FakeLambda:
        def invoke(self, **kwargs):
            invoked.update(kwargs)
            return {"StatusCode": 202}

    monkeypatch.setattr(fin, "_lambda_client", lambda: FakeLambda())
    monkeypatch.setenv("AGENT_FUNCTION_NAME", "aicfo-dev-agent")
    body = {"message": "Am I too concentrated?", "user_id": "victim-999",
            "job_id": "11111111-1111-4111-8111-111111111111"}
    res = fin.handler(_event("POST", "/chat", sub="user-a", body=body), None)
    assert res["statusCode"] == 202, res["body"]
    payload = json.loads(res["body"])
    assert payload["job_id"] == body["job_id"]
    assert "conversation_id" in payload
    # persisted QUEUED under verified sub
    assert store[("user-a", body["job_id"])]["status"] == "QUEUED"
    assert ("victim-999", body["job_id"]) not in store
    # async invoke shape
    assert invoked.get("InvocationType") == "Event"
    inner = json.loads(invoked["Payload"])
    assert inner["user_id"] == "user-a"
    assert inner["job_id"] == body["job_id"]
    assert "victim-999" not in json.dumps(inner)
    assert "email" not in inner


def test_post_chat_conditional_idempotent_duplicate(monkeypatch):
    fin, ag, store = _wire(monkeypatch)

    class FakeLambda:
        def invoke(self, **kwargs):
            return {"StatusCode": 202}

    monkeypatch.setattr(fin, "_lambda_client", lambda: FakeLambda())
    body = {"message": "hi", "job_id": "22222222-2222-4222-8222-222222222222"}
    first = fin.handler(_event("POST", "/chat", sub="user-a", body=body), None)
    assert first["statusCode"] == 202
    second = fin.handler(_event("POST", "/chat", sub="user-a", body=body), None)
    assert second["statusCode"] in (200, 202, 409)


def test_post_chat_dispatch_failure_marks_pollable_job_failed(monkeypatch):
    fin, ag, store = _wire(monkeypatch)

    class FailingLambda:
        def invoke(self, **kwargs):
            raise RuntimeError("sensitive internal failure")

    monkeypatch.setattr(fin, "_lambda_client", lambda: FailingLambda())
    body = {"message": "hi", "job_id": "33333333-3333-4333-8333-333333333333"}
    response = fin.handler(_event("POST", "/chat", sub="user-a", body=body), None)
    assert response["statusCode"] == 202
    job = store[("user-a", body["job_id"])]
    assert job["status"] == "FAILED"
    assert "sensitive" not in job["error"]


def test_cross_user_job_isolation(monkeypatch):
    fin, ag, store = _wire(monkeypatch)
    store[("user-a", "job-1")] = {"user_id": "user-a", "job_id": "job-1",
                                  "status": "COMPLETED", "answer": "done",
                                  "conversation_id": "c1"}
    res = ag.handler(_event("GET", "/chat/job-1", sub="user-b"), None)
    assert res["statusCode"] == 404


def test_polling_transitions_and_failure(monkeypatch):
    fin, ag, store = _wire(monkeypatch)
    store[("user-a", "job-q")] = {"user_id": "user-a", "job_id": "job-q",
                                  "status": "QUEUED", "conversation_id": "c1"}
    res = ag.handler(_event("GET", "/chat/job-q", sub="user-a"), None)
    assert res["statusCode"] == 200
    assert json.loads(res["body"])["status"] == "QUEUED"
    store[("user-a", "job-f")] = {"user_id": "user-a", "job_id": "job-f",
                                  "status": "FAILED", "error": "boom",
                                  "conversation_id": "c1"}
    res = ag.handler(_event("GET", "/chat/job-f", sub="user-a"), None)
    payload = json.loads(res["body"])
    assert payload["status"] == "FAILED"
    assert payload["error"] != "boom"
    assert "boom" not in payload["error"]


def test_conversations_scoped_to_sub(monkeypatch):
    import handlers.agent as ag

    captured = {}

    class ScopeTable(FakeTable):
        def query(self, **kwargs):
            assert "KeyConditionExpression" in kwargs
            captured.update(kwargs)
            return {"Items": []}

    store = {}
    monkeypatch.setattr(ag, "_chat_jobs_table", lambda: ScopeTable(store))
    res = ag.handler(_event("GET", "/conversations", sub="user-a"), None)
    assert res["statusCode"] == 200
    cond = captured["KeyConditionExpression"]
    assert "user-a" in str(getattr(cond, "_values", "")) + str(cond)
    assert json.loads(res["body"])["conversations"] == []
