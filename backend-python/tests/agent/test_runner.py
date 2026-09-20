"""Job-runner tests — doubles only, never the live model."""

import os
import sys
import types
from types import SimpleNamespace

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
    assert job["proposed_actions"][0]["expires_at"].endswith("Z")


def test_runner_shares_firecrawl_guard_and_client_for_one_job():
    """Search caps and result IDs must survive across the real runner invocation."""
    from agent import runner as runner_mod
    from agent import tools as tools_mod
    from agent.research_safety import ResearchGuard

    class Research:
        def __init__(self):
            self.guard = ResearchGuard(max_searches=1, max_reads=1)
            self.search_calls = 0
            self.read_calls = 0

        def search(self, query, **_kwargs):
            self.search_calls += 1
            self.guard.record_search()
            self.guard.record_search_result("r1", "https://rbi.org.in/rules")
            return {"source": "Firecrawl", "as_of": "2026-09-20", "citations": [
                {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20",
                 "url": "https://rbi.org.in/rules"}
            ], "data": []}

        def read(self, result_id, user_urls=()):
            self.read_calls += 1
            url = self.guard.validate_read(result_id, user_urls)
            return {"source": "Firecrawl", "as_of": "2026-09-20", "citations": [
                {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20", "url": url}
            ], "data": {"content": "safe"}}

    class ResearchAgent:
        def stream_async(self, _prompt, **kwargs):
            state = kwargs["invocation_state"]
            context = SimpleNamespace(invocation_state=state)
            first = tools_mod.web_search("latest RBI inflation guidance", tool_context=context)
            read = tools_mod.read_web_page("r1", tool_context=context)
            capped_search = tools_mod.web_search("latest RBI repo guidance", tool_context=context)
            capped_read = tools_mod.read_web_page("r1", tool_context=context)
            assert capped_search["error_code"] == "UPSTREAM_UNAVAILABLE"
            assert capped_read["error_code"] == "UPSTREAM_UNAVAILABLE"

            async def stream():
                yield {"tool_result": first}
                yield {"tool_result": read}
                yield {"data": "Research complete."}

            return stream()

    research = Research()
    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {"user_id": "user-a", "job_id": "job-1",
                                       "status": "QUEUED", "conversation_id": "c1"}
    job = runner_mod.run_chat_job(
        {**_payload(), "message": "Read https://rbi.org.in/rules and summarize."},
        deps={"jobs_table": jobs, "conv_table": conv, "agent": ResearchAgent(),
              "firecrawl_client": research, "tracker": tools_mod.ToolCallTracker(),
              "publisher": lambda *a, **k: True},
    )
    assert job["status"] == "COMPLETED"
    assert research.search_calls == 2  # the second call was attempted and capped
    assert research.read_calls == 2
    assert {item["id"] for item in job["citations"]} == {"r1"}
    assert job["citations"][0]["url"] == "https://rbi.org.in/rules"


def test_runner_extracts_only_safe_user_urls_into_invocation_state():
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    class CapturingAgent:
        def __init__(self):
            self.state = None

        def stream_async(self, _prompt, **kwargs):
            self.state = kwargs["invocation_state"]

            async def stream():
                yield {"data": "ok"}

            return stream()

    agent = CapturingAgent()
    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {"user_id": "user-a", "job_id": "job-1",
                                       "status": "QUEUED", "conversation_id": "c1"}
    runner_mod.run_chat_job(
        {**_payload(), "message":
         "Read https://rbi.org.in/rules and https://user:pass@evil.example/private."},
        deps={"jobs_table": jobs, "conv_table": conv, "agent": agent,
              "tracker": tools_mod.ToolCallTracker(), "publisher": lambda *a, **k: True},
    )
    assert agent.state["user_urls"] == ("https://rbi.org.in/rules",)


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


def test_read_question_containing_change_does_not_route_to_proposal():
    from agent import runner as runner_mod

    latest = runner_mod._strands_messages([], "How did my portfolio change?")[-1]["content"][0]["text"]
    assert "propose_*" not in latest
    assert "get_portfolio_analysis" in latest


def test_spending_change_question_routes_to_cashflow_read():
    from agent import runner as runner_mod

    latest = runner_mod._strands_messages([], "What changed in my spending?")[-1]["content"][0]["text"]
    assert "propose_*" not in latest
    assert "get_cashflow_summary" in latest


def test_imperative_edit_still_routes_to_proposal():
    from agent import runner as runner_mod

    latest = runner_mod._strands_messages([], "Update my loan balance to 400000")[-1]["content"][0]["text"]
    assert "propose_*" in latest


@pytest.mark.parametrize(("message", "read_tool"), [
    ("Can you update me on my portfolio?", "get_portfolio_analysis"),
    ("Could you update me on what changed in my spending?", "get_cashflow_summary"),
    ("Would you update me about my cash flow?", "get_cashflow_summary"),
    ("Can you please update me with the latest on my portfolio?", "get_portfolio_analysis"),
    ("Please update me on my portfolio", "get_portfolio_analysis"),
    ("Could you update me regarding my portfolio?", "get_portfolio_analysis"),
])
def test_update_me_status_request_routes_to_read(message, read_tool):
    from agent import runner as runner_mod

    latest = runner_mod._strands_messages([], message)[-1]["content"][0]["text"]
    assert "propose_*" not in latest
    assert read_tool in latest


def test_conversational_edit_request_routes_to_proposal():
    from agent import runner as runner_mod

    latest = runner_mod._strands_messages([], "Can you update my loan balance to 500000?")[-1]["content"][0]["text"]
    assert "propose_*" in latest


def test_i_want_edit_request_routes_to_proposal():
    from agent import runner as runner_mod

    latest = runner_mod._strands_messages([], "I want to update my income to 100000")[-1]["content"][0]["text"]
    assert "propose_*" in latest


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


def _research_job(agent, message, research=None):
    from agent import runner as runner_mod
    from agent import tools as tools_mod

    jobs, conv = FakeJobs(), FakeConv()
    jobs.items[("user-a", "job-1")] = {"user_id": "user-a", "job_id": "job-1",
                                       "status": "QUEUED", "conversation_id": "c1"}
    deps = {"jobs_table": jobs, "conv_table": conv, "agent": agent,
            "tracker": tools_mod.ToolCallTracker(), "publisher": lambda *a, **k: True}
    if research is not None:
        deps["firecrawl_client"] = research
    return runner_mod.run_chat_job({**_payload(), "message": message}, deps=deps)


class _StreamOf:
    def __init__(self, events):
        self.events = events

    def stream_async(self, _prompt, **_kwargs):
        async def stream():
            for event in self.events:
                yield event
            yield {"data": "done"}
        return stream()


def test_runner_keeps_firecrawl_citations_but_drops_unsafe_titles_not_the_citation():
    good = {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20T10:00:00Z",
            "url": "https://rbi.org.in/rules", "title": "RBI rules"}
    empty_title = {"id": "r2", "source": "Firecrawl", "as_of": "2026-09-20T10:00:00Z",
                   "url": "https://rbi.org.in/faq", "title": ""}
    raw_title = {"id": "r3", "source": "Firecrawl", "as_of": "2026-09-20T10:00:00Z",
                 "url": "https://sebi.gov.in/x", "title": "Search results: complete tool output"}
    job = _research_job(_StreamOf([{"tool_result": {"source": "Firecrawl", "as_of": "2026-09-20T10:00:00Z",
                                                    "citations": [good, empty_title, raw_title]}}]),
                        "Summarize RBI rules")
    assert job["status"] == "COMPLETED"
    by_id = {item["id"]: item for item in job["citations"]}
    assert set(by_id) == {"r1", "r2", "r3"}
    assert by_id["r1"]["title"] == "RBI rules"
    assert "title" not in by_id["r2"]
    assert "title" not in by_id["r3"]
    assert by_id["r3"]["url"] == "https://sebi.gov.in/x"
    # A research tool_result never doubles as a bare source/as_of citation.
    assert all("id" in item for item in job["citations"])


@pytest.mark.parametrize("citation", [
    {"source": "Firecrawl", "as_of": "2026-09-20T10:00:00Z", "url": "https://rbi.org.in/rules"},
    {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20T10:00:00Z"},
    {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20", "url": "javascript:alert(1)"},
    {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20", "url": "http://rbi.org.in/rules"},
    {"id": "r1", "source": "Firecrawl", "as_of": "yesterday", "url": "https://rbi.org.in/rules"},
    {"id": "r\x001", "source": "Firecrawl", "as_of": "2026-09-20", "url": "https://rbi.org.in/rules"},
    {"id": "<b>r1</b>", "source": "Firecrawl", "as_of": "2026-09-20", "url": "https://rbi.org.in/rules"},
    {"id": "r1", "source": "evil", "as_of": "2026-09-20", "url": "https://rbi.org.in/rules"},
    {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20", "url": "https://rbi.org.in/rules",
     "result": {"markdown": "raw"}},
    {"id": "r1", "source": "Firecrawl", "as_of": "2026-09-20", "url": "https://rbi.org.in/rules",
     "account_number": "12345678"},
    "not-a-dict",
])
def test_runner_rejects_malformed_or_unsafe_research_citations(citation):
    job = _research_job(_StreamOf([{"tool_result": {"source": "Firecrawl", "as_of": "2026-09-20",
                                                    "citations": [citation]}}]),
                        "Summarize RBI rules")
    assert job["status"] == "COMPLETED"
    assert job["citations"] == []


def test_runner_result_ids_do_not_leak_between_jobs(monkeypatch):
    """A second job without the first job client must not read its result IDs."""
    import integrations.firecrawl as firecrawl_mod
    from agent import tools as tools_mod
    from agent.research_safety import ResearchGuard

    class FakeClient:
        def __init__(self, http, api_key, guard=None, base_url=None):
            self.guard = guard or ResearchGuard()

        def search(self, query, **_kwargs):
            self.guard.validate_query(query)
            self.guard.record_search()
            self.guard.record_search_result("r1", "https://rbi.org.in/rules")
            return {"source": "Firecrawl", "as_of": "2026-09-20", "citations": [], "data": []}

        def read(self, result_id_or_url, user_urls=()):
            url = self.guard.validate_read(result_id_or_url, user_urls)
            return {"source": "Firecrawl", "as_of": "2026-09-20", "citations": [],
                    "data": {"url": url, "content": ""}}

    monkeypatch.setattr(firecrawl_mod, "FirecrawlClient", FakeClient)
    monkeypatch.setenv("FIRECRAWL_API_KEY", "test-key")
    seen = {}

    class SearchAgent:
        def stream_async(self, _prompt, **kwargs):
            context = SimpleNamespace(invocation_state=kwargs["invocation_state"])
            seen["search"] = tools_mod.web_search("latest RBI inflation guidance", tool_context=context)
            seen["same_job_read"] = tools_mod.read_web_page("r1", tool_context=context)

            async def stream():
                yield {"data": "ok"}
            return stream()

    class ReadAgent:
        def stream_async(self, _prompt, **kwargs):
            context = SimpleNamespace(invocation_state=kwargs["invocation_state"])
            seen["other_job_read"] = tools_mod.read_web_page("r1", tool_context=context)

            async def stream():
                yield {"data": "ok"}
            return stream()

    assert _research_job(SearchAgent(), "What did RBI say?")["status"] == "COMPLETED"
    assert seen["search"]["source"] == "Firecrawl"
    assert seen["same_job_read"]["data"]["url"] == "https://rbi.org.in/rules"
    assert _research_job(ReadAgent(), "Read r1 please")["status"] == "COMPLETED"
    assert seen["other_job_read"]["ok"] is False
    assert seen["other_job_read"]["error_code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize("message, expected", [
    ("See https://rbi.org.in/rules, https://rbi.org.in/rules and http://sebi.gov.in/x.",
     ("https://rbi.org.in/rules", "http://sebi.gov.in/x")),
    ("Read https://user:pass@evil.example/private and https://​evil.example/", ()),
    ("Broken https:// and https:///nohost and https://example.com:0/ links", ()),
    ("Control https://example.com/a\x07b here", ()),
    ("Wrapped (https://example.com/path?q=1) and <https://example.com/b>",
     ("https://example.com/path?q=1", "https://example.com/b")),
    ("Not a link: javascript:alert(1) or ftp://files.example/x", ()),
])
def test_trusted_user_urls_are_normalized_and_hostile_ones_dropped(message, expected):
    from agent import runner as runner_mod

    assert runner_mod._trusted_user_urls(message) == expected


def test_trusted_user_urls_are_capped_to_the_read_budget():
    from agent import runner as runner_mod

    message = " ".join(f"https://example.com/page{i}" for i in range(20))
    urls = runner_mod._trusted_user_urls(message)
    assert len(urls) == 8
    assert urls[0] == "https://example.com/page0"
