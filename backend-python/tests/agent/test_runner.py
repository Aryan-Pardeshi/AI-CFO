"""Job-runner tests — doubles only, never the live model."""

import os
import sys
import types

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


class FakeJobs:
    def __init__(self):
        self.items = {}

    def put_item(self, Item, **kwargs):
        cond = str(kwargs.get("ConditionExpression", ""))
        key = (Item["user_id"], Item["job_id"])
        if "attribute_not_exists" in cond and key in self.items:
            raise Exception("conditional")
        self.items[key] = dict(Item)

    def get_item(self, Key):
        item = self.items.get((Key["user_id"], Key["job_id"]))
        return {"Item": dict(item)} if item else {}


class FakeConv:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    def put_item(self, Item, **kwargs):
        self.rows.append(dict(Item))

    def query(self, **kwargs):
        assert "KeyConditionExpression" in kwargs
        return {"Items": list(self.rows)}


class FakeAgentResult:
    def __init__(self, text, tools_used):
        self.text = text
        self.tools_used = tools_used


class FakeAgent:
    def __init__(self, text="Under these assumptions, all good.", tools_used=None):
        self.text = text
        self.tools_used = tools_used or ["get_portfolio_analysis"]
        self.seen = {}

    def run(self, message, history=None, tracker=None):
        self.seen = {"message": message, "history_len": len(history or [])}
        tracker.record(self.tools_used[0])
        return FakeAgentResult(self.text, self.tools_used)


def _payload():
    return {"user_id": "user-a", "job_id": "job-1",
            "conversation_id": "c1", "message": "Am I too concentrated?"}


def test_run_completes_and_persists_without_raw_tool_output():
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {"user_id": "user-a", "job_id": "job-1",
                                       "status": "QUEUED", "conversation_id": "c1"}
    published = []
    agent = FakeAgent()
    job = runner_mod.run_chat_job(
        _payload(),
        deps={"jobs_table": jobs, "conv_table": conv, "agent": agent,
              "tracker": tools_mod.ToolCallTracker(),
              "publisher": lambda ch, t, p=None: published.append((ch, t)) or True},
    )
    assert job["status"] == "COMPLETED"
    assert job["answer"] == agent.text
    assert job["tool_calls"] == ["get_portfolio_analysis"]
    roles = [r["role"] for r in conv.rows]
    assert roles == ["user", "assistant"]
    assistant = conv.rows[1]
    assert assistant["tools_used"] == ["get_portfolio_analysis"]
    assert "tool_output" not in assistant  # never raw tool output
    assert published[0][0] == "/jobs/user-a/job-1"


def test_completed_job_persists_safe_activity_citations_and_proposals():
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    class MetadataAgent(FakeAgent):
        def run(self, message, history=None, tracker=None):
            tracker.record("get_portfolio_analysis")
            return FakeAgentResult("grounded", ["get_portfolio_analysis"])

    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {"user_id": "user-a", "job_id": "job-1",
                                       "status": "QUEUED", "conversation_id": "c1"}
    job = runner_mod.run_chat_job(
        _payload(),
        deps={"jobs_table": jobs, "conv_table": conv, "agent": MetadataAgent(),
              "tracker": tools_mod.ToolCallTracker(), "publisher": lambda *a, **k: True},
    )
    assert isinstance(job["tool_activity"], list)
    assert isinstance(job["citations"], list)
    assert isinstance(job["proposed_actions"], list)
    assert all("user_id" not in item for item in job["tool_activity"] + job["citations"] + job["proposed_actions"])


def test_tool_activity_is_persisted_during_running_progress():
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {"user_id": "user-a", "job_id": "job-1",
                                       "status": "QUEUED", "conversation_id": "c1"}
    seen = []
    runner_mod.run_chat_job(
        _payload(),
        deps={"jobs_table": jobs, "conv_table": conv, "agent": FakeAgent(),
              "tracker": tools_mod.ToolCallTracker(),
              "publisher": lambda _ch, event, data=None: seen.append((event, data)) or True},
    )
    assert any(event == "tool_start" for event, _ in seen)
    assert jobs.items[("user-a", "job-1")].get("tool_activity")


def test_real_tool_result_is_saved_as_citation_and_model_proposal_is_saved():
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    class AgentWithMetadata:
        def stream_async(self, *_args, **_kwargs):
            async def stream():
                yield {"current_tool_use": {"toolUseId": "t1", "name": "get_net_worth"}}
                yield {"tool_result": {"source": "holdings", "as_of": "2026-09-20"}}
                yield {"proposed_action": {"entity": "goal", "operation": "create",
                                              "payload": {"name": "car"}}}
                yield {"data": "I can prepare that proposal for your review."}
            return stream()

    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {"user_id": "user-a", "job_id": "job-1",
                                       "status": "QUEUED", "conversation_id": "c1"}
    job = runner_mod.run_chat_job(
        {**_payload(), "message": "Please create a car goal"}, deps={"jobs_table": jobs, "conv_table": conv, "agent": AgentWithMetadata(),
                          "tracker": tools_mod.ToolCallTracker(), "publisher": lambda *a, **k: True},
    )
    assert job["citations"] == [{"source": "holdings", "as_of": "2026-09-20"}]
    assert job["proposed_actions"][0]["entity"] == "goal"


def test_run_history_capped_at_10():
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    rows = [{"user_conv": "user-a#c1", "msg_sk": f"2026-09-18T00:00:{i:02d}Z#m{i}",
             "role": "user", "content": f"m{i}"} for i in range(30)]
    jobs, conv = FakeJobs(), FakeConv(rows)
    jobs.items[("user-a", "job-1")] = {"user_id": "user-a", "job_id": "job-1",
                                       "status": "QUEUED", "conversation_id": "c1"}
    agent = FakeAgent()
    runner_mod.run_chat_job(
        _payload(),
        deps={"jobs_table": jobs, "conv_table": conv, "agent": agent,
              "tracker": tools_mod.ToolCallTracker(), "publisher": lambda *a, **k: False},
    )
    assert agent.seen["history_len"] == 10


def test_run_persists_standard_strands_stream_data_and_tool_use():
    """A real Strands ``data``/``current_tool_use`` stream must reach the chat job."""
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    class StandardStrandsAgent:
        def stream_async(self, *_args, **_kwargs):
            async def stream():
                yield {
                    "current_tool_use": {
                        "toolUseId": "tool-42",
                        "name": "get_financial_snapshot",
                        "input": {},
                    }
                }
                yield {"data": "Your saved financial snapshot is ready."}

            return stream()

    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {
        "user_id": "user-a", "job_id": "job-1",
        "status": "QUEUED", "conversation_id": "c1",
    }
    published = []
    job = runner_mod.run_chat_job(
        _payload(),
        deps={
            "jobs_table": jobs,
            "conv_table": conv,
            "agent": StandardStrandsAgent(),
            "tracker": tools_mod.ToolCallTracker(),
            "publisher": lambda _channel, event_type, _payload=None:
                published.append(event_type) or True,
        },
    )

    assert job["status"] == "COMPLETED"
    assert job["answer"] == "Your saved financial snapshot is ready."
    assert job["tool_calls"] == ["get_financial_snapshot"]
    assert published.count("tool_start") == 1
    assert published.count("tool_end") == 1


def test_run_passes_persisted_turns_to_a_new_strands_agent():
    """A fresh Lambda agent must receive the saved conversation, not only the latest turn."""
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    class CapturingStrandsAgent:
        def __init__(self):
            self.prompt = None

        def stream_async(self, prompt, **_kwargs):
            self.prompt = prompt

            async def stream():
                yield {"data": "I can use the earlier context."}

            return stream()

    history_rows = [
        {
            "user_conv": "user-a#c1",
            "msg_sk": "2026-09-18T00:00:01Z#u1",
            "role": "user",
            "content": "My target is to retire at 45.",
        },
        {
            "user_conv": "user-a#c1",
            "msg_sk": "2026-09-18T00:00:02Z#a1",
            "role": "assistant",
            "content": "I will use age 45 for this conversation.",
        },
    ]
    jobs, conv = FakeJobs(), FakeConv(history_rows)
    jobs.items[("user-a", "job-1")] = {
        "user_id": "user-a", "job_id": "job-1",
        "status": "QUEUED", "conversation_id": "c1",
    }
    agent = CapturingStrandsAgent()

    runner_mod.run_chat_job(
        _payload(),
        deps={
            "jobs_table": jobs,
            "conv_table": conv,
            "agent": agent,
            "tracker": tools_mod.ToolCallTracker(),
            "publisher": lambda *_args, **_kwargs: False,
        },
    )

    assert agent.prompt[:2] == [
        {"role": "user", "content": [{"text": "My target is to retire at 45."}]},
        {
            "role": "assistant",
            "content": [{"text": "I will use age 45 for this conversation."}],
        },
    ]
    latest = agent.prompt[-1]["content"][0]["text"]
    assert latest.startswith("Am I too concentrated?")
    assert "get_portfolio_analysis" in latest


def test_cashflow_turn_has_an_explicit_live_tool_route():
    """A latest cashflow request must not be answered with a stale FIRE turn."""
    from agent import runner as runner_mod

    messages = runner_mod._strands_messages(
        [{"role": "assistant", "content": "Your FIRE age is 46."}],
        "Summarize my cashflow from saved transactions.",
    )

    latest = messages[-1]["content"][0]["text"]
    assert "LATEST REQUEST" in latest
    assert "get_cashflow_summary" in latest
    assert "not calculate_fire" in latest


def test_run_completes_even_if_publish_fails():
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {"user_id": "user-a", "job_id": "job-1",
                                       "status": "QUEUED", "conversation_id": "c1"}

    def boom(*a, **k):
        raise RuntimeError("events down")

    job = runner_mod.run_chat_job(
        _payload(),
        deps={"jobs_table": jobs, "conv_table": conv, "agent": FakeAgent(),
              "tracker": tools_mod.ToolCallTracker(), "publisher": boom},
    )
    assert job["status"] == "COMPLETED"


def test_run_marks_failed_on_agent_error():
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    class BadAgent:
        def run(self, *a, **k):
            raise RuntimeError("bedrock down")

    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {"user_id": "user-a", "job_id": "job-1",
                                       "status": "QUEUED", "conversation_id": "c1"}
    job = runner_mod.run_chat_job(
        _payload(),
        deps={"jobs_table": jobs, "conv_table": conv, "agent": BadAgent(),
              "tracker": tools_mod.ToolCallTracker(), "publisher": lambda *a, **k: False},
    )
    assert job["status"] == "FAILED"
    assert job["error"] == runner_mod.SAFE_CHAT_ERROR


def test_run_retries_once_with_kilo_fallback_after_provider_api_error():
    """A transient Kilo provider failure must not fail an otherwise valid chat job."""
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    APIError = type("APIError", (Exception,), {})

    class FailingStreamAgent:
        def stream_async(self, *_args, **_kwargs):
            async def stream():
                raise APIError("upstream unavailable")
                yield {}

            return stream()

    class FallbackStreamAgent:
        def stream_async(self, *_args, **_kwargs):
            async def stream():
                yield {"text_delta": "Under these assumptions, the fallback answered."}

            return stream()

    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {
        "user_id": "user-a", "job_id": "job-1", "status": "QUEUED", "conversation_id": "c1"
    }
    fallback_calls = []

    def fallback_factory():
        fallback_calls.append(True)
        return FallbackStreamAgent()

    job = runner_mod.run_chat_job(
        _payload(),
        deps={
            "jobs_table": jobs,
            "conv_table": conv,
            "agent": FailingStreamAgent(),
            "fallback_agent_factory": fallback_factory,
            "tracker": tools_mod.ToolCallTracker(),
            "publisher": lambda *args, **kwargs: False,
        },
    )

    assert job["status"] == "COMPLETED"
    assert job["answer"] == "Under these assumptions, the fallback answered."
    assert fallback_calls == [True]


def test_run_uses_second_kilo_fallback_when_primary_and_first_fallback_fail():
    """A provider outage on two models must still complete with Kilo Auto."""
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    APIError = type("APIError", (Exception,), {})

    class FailingStreamAgent:
        def stream_async(self, *_args, **_kwargs):
            async def stream():
                raise APIError("upstream unavailable")
                yield {}

            return stream()

    class SuccessfulStreamAgent:
        def stream_async(self, *_args, **_kwargs):
            async def stream():
                yield {"text_delta": "Kilo Auto answered after both model providers failed."}

            return stream()

    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {
        "user_id": "user-a", "job_id": "job-1", "status": "QUEUED", "conversation_id": "c1"
    }
    fallback_attempts = []

    def first_fallback_factory():
        fallback_attempts.append("nemotron")
        return FailingStreamAgent()

    def second_fallback_factory():
        fallback_attempts.append("kilo-auto")
        return SuccessfulStreamAgent()

    job = runner_mod.run_chat_job(
        _payload(),
        deps={
            "jobs_table": jobs,
            "conv_table": conv,
            "agent": FailingStreamAgent(),
            "fallback_agent_factories": [first_fallback_factory, second_fallback_factory],
            "tracker": tools_mod.ToolCallTracker(),
            "publisher": lambda *args, **kwargs: False,
        },
    )

    assert job["status"] == "COMPLETED"
    assert job["answer"] == "Kilo Auto answered after both model providers failed."
    assert fallback_attempts == ["nemotron", "kilo-auto"]


def test_default_agent_factory_falls_back_only_without_strands_layer(monkeypatch):
    """Missing Strands (local/dev) degrades honestly to the stated fallback."""
    from agent import model as model_mod
    from agent import runner as runner_mod

    monkeypatch.setattr(model_mod, "create_kilo_model", lambda **kw: object())
    monkeypatch.setitem(sys.modules, "strands", None)
    agent = runner_mod._default_agent_factory()
    assert getattr(agent, "_tool_registry", None) is not None


def test_default_agent_factory_propagates_real_construction_errors(monkeypatch):
    """A genuine Agent failure must surface, never a canned answer."""
    from agent import model as model_mod
    from agent import runner as runner_mod

    class BoomAgent:
        def __init__(self, **kwargs):
            raise RuntimeError("tool schema invalid")

    monkeypatch.setattr(model_mod, "create_kilo_model", lambda **kw: object())
    monkeypatch.setitem(sys.modules, "strands", types.SimpleNamespace(Agent=BoomAgent))
    with pytest.raises(RuntimeError, match="tool schema invalid"):
        runner_mod._default_agent_factory()


def test_async_handler_event_runs_job():
    import handlers.agent as ag
    import agent.runner as runner_mod

    seen = {}

    def fake_run(payload):
        seen.update(payload)
        return {"status": "COMPLETED"}

    import unittest.mock as mock

    with mock.patch.object(runner_mod, "run_chat_job", fake_run):
        res = ag.handler(_payload(), None)
    assert res == {"status": "ok"}
    assert seen["user_id"] == "user-a"
