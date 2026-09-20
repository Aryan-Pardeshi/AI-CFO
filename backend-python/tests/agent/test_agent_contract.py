"""Chat/Kilo contract tests — model wiring and safety boundaries."""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


ALLOWED_TOOLS = {
    "get_financial_snapshot",
    "get_portfolio_analysis",
    "get_goals",
    "calculate_fire",
    "simulate_goal_impact",
    "get_net_worth",
    "project_net_worth",
    "get_cashflow_summary",
    "propose_action",
}

UNSHIPPED = [
    "search_securities", "get_security_overview", "get_security_risk_metrics",
    "analyze_portfolio_fit", "upstox", "mfapi", "firecrawl", "web_search",
    "read_web_page", "estimate_income_tax", "compare_tax_regimes",
    "estimate_capital_gains_tax", "estimate_insurance_needs",
    "calculate_emi", "calculate_prepayment_impact",
    "calculate_credit_card_payoff", "get_loans",
]


def test_kilo_factory_uses_pinned_gateway_config(monkeypatch):
    monkeypatch.delenv("KILO_MODEL_ID", raising=False)
    monkeypatch.delenv("KILO_BASE_URL", raising=False)
    from agent import model as model_mod
    assert model_mod.KILO_BASE_URL_DEFAULT == "https://api.kilo.ai/api/gateway"
    assert model_mod.KILO_MODEL_ID_DEFAULT == "deepseek/deepseek-v4-flash-0731:free"
    assert model_mod.KILO_FALLBACK_MODEL_ID_DEFAULT == "nvidia/nemotron-3-super-120b-a12b:free"
    assert getattr(model_mod, "KILO_SECOND_FALLBACK_MODEL_ID_DEFAULT", "") == "kilo-auto/free"
    assert model_mod.KILO_SECRET_ID_DEFAULT == "aicfo/kilo"
    seen = {}

    class FakeOpenAIModel:
        def __init__(self, **kwargs):
            seen.update(kwargs)

    created = model_mod.create_kilo_model(model_cls=FakeOpenAIModel, api_key="test-key")
    assert created is not None
    assert seen["model_id"] == "deepseek/deepseek-v4-flash-0731:free"
    assert seen["client_args"] == {
        "api_key": "test-key",
        "base_url": "https://api.kilo.ai/api/gateway",
    }
    assert seen["params"] == {"temperature": pytest.approx(0.2), "max_tokens": 2000}


def test_kilo_factory_honors_model_and_base_url_overrides(monkeypatch):
    monkeypatch.setenv("KILO_MODEL_ID", "provider/custom-model")
    monkeypatch.setenv("KILO_BASE_URL", "https://example.test/gateway")
    from agent import model as model_mod
    seen = {}

    class FakeOpenAIModel:
        def __init__(self, **kwargs):
            seen.update(kwargs)

    model_mod.create_kilo_model(model_cls=FakeOpenAIModel, api_key="test-key")
    assert model_mod.configured_model_id() == "provider/custom-model"
    assert seen["model_id"] == "provider/custom-model"
    assert seen["client_args"]["base_url"] == "https://example.test/gateway"


def test_system_prompt_safety_boundary():
    from agent import prompt as prompt_mod
    text = prompt_mod.SYSTEM_PROMPT.lower()
    assert "educational" in text
    assert "under these assumptions" in text
    assert "tool" in text  # numbers must come from a tool
    assert "missing" in text  # missing tool data means say missing
    assert "licens" in text or "not a licensed" in text or "not licensed" in text
    assert "guarantee" in text
    assert "trade" in text
    # must never promise concealment; must disclose failure
    assert "fail" in text
    assert "untrusted_web" in text
    assert "search quer" in text
    assert "statement" in text


def test_only_shipped_tools_registered():
    from agent import tools as tools_mod
    registry = tools_mod.get_tool_registry()
    assert set(registry.keys()) == ALLOWED_TOOLS
    for banned in UNSHIPPED:
        assert banned not in registry
        for name in registry:
            assert banned not in name


def test_tool_result_schema_and_paise_conversion():
    from agent import tools as tools_mod
    ok = tools_mod.ok_result({"x": 1}, source="holdings", as_of="2026-09-18T00:00:00Z")
    assert ok["ok"] is True
    assert "data" in ok and "source" in ok and "as_of" in ok
    assert "assumptions" in ok and "warnings" in ok
    err = tools_mod.err_result("NOT_FOUND", "nope")
    assert err == {"ok": False, "error_code": "NOT_FOUND", "message": "nope"}
    # paise -> inr only at tool boundary
    assert tools_mod.paise_to_inr(84550) == pytest.approx(845.50)
    assert tools_mod.paise_to_inr(100) == pytest.approx(1.0)


def test_tools_use_invocation_state_identity():
    import inspect
    from agent import tools as tools_mod
    src = inspect.getsource(tools_mod)
    assert "@tool(context=True)" in src or "@tool(context = True)" in src
    assert 'invocation_state["user_id"]' in src or "invocation_state['user_id']" in src
    # model never supplies identity: no registered tool may expose a user_id
    # parameter to the model's tool schema.
    checked = []
    for name, fn in tools_mod.get_tool_registry().items():
        if not inspect.isfunction(fn):
            continue  # Strands Tool wrapper (Lambda layer only)
        assert "user_id" not in inspect.signature(fn).parameters, name
        checked.append(name)
    assert checked, "registry must expose inspectable functions in this environment"


def test_tool_cap_enforced_before_31st():
    from agent import tools as tools_mod
    tracker = tools_mod.ToolCallTracker(cap=30)
    for _ in range(30):
        tracker.record("get_goals")
    with pytest.raises(tools_mod.ToolCapExceeded):
        tracker.record("get_goals")
    assert tracker.count == 30


def test_registered_tool_rejects_31st_call_before_data_access():
    from agent import tools as tools_mod

    class Context:
        def __init__(self):
            self.invocation_state = {
                "user_id": "user-a",
                "tracker": tools_mod.ToolCallTracker(cap=30),
            }

    context = Context()
    for _ in range(30):
        context.invocation_state["tracker"].record("prior_tool")
    with pytest.raises(tools_mod.ToolCapExceeded):
        tools_mod.get_goals(context)


def test_runner_does_not_double_count_stream_tool_events():
    import inspect
    from agent import runner as runner_mod

    assert "tracker.record" not in inspect.getsource(runner_mod._invoke)


def test_history_returns_last_10_only():
    from agent import store as store_mod

    class FakeTable:
        def __init__(self):
            self.scan_called = False
            self.items = [
                {"user_conv": "u#c1", "msg_sk": f"2026-09-18T00:00:{i:02d}Z#m{i}",
                 "role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"}
                for i in range(30)
            ]

        def query(self, **kwargs):
            assert "KeyConditionExpression" in kwargs
            return {"Items": self.items}

        def scan(self, **kwargs):
            self.scan_called = True
            return {"Items": []}

    table = FakeTable()
    history = store_mod.get_history(table, "u", "c1", limit=10)
    assert len(history) == 10
    assert history[0]["content"] == "m20"
    assert table.scan_called is False


def test_store_uses_env_table_names_and_query_only(monkeypatch):
    import inspect
    from agent import store as store_mod
    src = inspect.getsource(store_mod)
    assert "CONVERSATIONS_TABLE" in src
    assert "CHAT_JOBS_TABLE" in src
    assert ".scan(" not in src
    assert "user_conv" in src


def test_kilo_references_in_runtime_and_config():
    repo = os.path.join(os.path.dirname(__file__), "..", "..", "..")
    for rel in ["backend-python/requirements.txt", "infra/template.yaml", "backend-python/agent/model.py"]:
        with open(os.path.join(repo, rel)) as f:
            content = f.read()
        assert "KILO" in content or "Kilo" in content or "aicfo/kilo" in content, rel
    with open(os.path.join(repo, "backend-python/requirements.txt")) as f:
        req = f.read()
    assert "openai>=1.0" in req.lower()
    with open(os.path.join(repo, "backend-python/agent/model.py")) as f:
        model = f.read()
    assert "OpenAIModel" in model
    assert "secretsmanager" in model
    with open(os.path.join(repo, "infra/template.yaml")) as f:
        tpl = f.read()
    assert "KILO_BASE_URL: https://api.kilo.ai/api/gateway" in tpl
    assert "KILO_MODEL_ID: deepseek/deepseek-v4-flash-0731:free" in tpl
    assert "KILO_FALLBACK_MODEL_ID: nvidia/nemotron-3-super-120b-a12b:free" in tpl
    assert "KILO_SECOND_FALLBACK_MODEL_ID: kilo-auto/free" in tpl
    assert "aicfo/kilo-*" in tpl
    assert "AllowNemotronNanoModelInvoke" not in tpl
    assert "global.amazon.nova-2-lite-v1:0" in tpl
    assert tpl.count("bedrock:InvokeModel") >= 2
    assert "bedrock:InvokeModelWithResponseStream" in tpl
