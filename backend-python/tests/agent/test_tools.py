import pytest
from types import SimpleNamespace


def test_proposal_tool_does_not_expose_trusted_message_as_model_input():
    import inspect
    from agent import tools

    parameters = inspect.signature(tools.get_tool_registry()["propose_action"]).parameters
    assert set(parameters) == {"entity", "operation", "target", "payload", "tool_context"}


@pytest.mark.parametrize("caller_field", ["current_message", "message", "invocation_state"])
def test_proposal_cannot_authorize_name_with_caller_supplied_message(caller_field):
    from agent import tools

    supplied = {caller_field: {"message": "Car"} if caller_field == "invocation_state" else "Car"}
    with pytest.raises((TypeError, ValueError)):
        tools.propose_action(
            "goal", "create", payload={"name": "Car"},
            tool_context=SimpleNamespace(invocation_state={"message": "Create a Wedding goal"}),
            **supplied,
        )


@pytest.mark.parametrize("name", [
    "complete tool output holdings allocation", "raw response", "tool_result",
])
def test_proposal_names_reject_raw_output_markers_even_in_trusted_message(name):
    from agent import tools

    with pytest.raises(ValueError, match="raw-output"):
        tools.propose_action(
            "goal", "create", payload={"name": name},
            tool_context=SimpleNamespace(invocation_state={"message": f"Create {name}"}),
        )
    with pytest.raises(ValueError, match="raw-output"):
        tools.validate_stored_action("goal", "create", payload={"name": name})


@pytest.mark.parametrize("name", ["Wedding", "Tool shed", "Asset allocation course"])
def test_proposal_accepts_valid_names_from_trusted_current_turn(name):
    from agent import tools

    proposal = tools.propose_action(
        "goal", "create", payload={"name": name},
        tool_context=SimpleNamespace(invocation_state={"message": f"Create a {name} goal"}),
    )
    assert proposal["entity"] == "goal"
    assert proposal["payload"] == {"name": name}
    assert proposal["expires_at"].endswith("Z")


def test_proposal_name_requires_trusted_current_turn():
    from agent import tools

    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"name": "Wedding"})


def test_safe_metadata_builders_validate_and_never_include_identity():
    from agent import tools

    activity = tools.record_activity("get_net_worth", "started")
    citation = tools.record_citation("holdings", "2026-09-20T00:00:00Z")
    proposal = tools.propose_action(
        "goal", "create", payload={"goal_type": "EDUCATION", "amount_today_paise": 100000}
    )
    assert activity == {"tool": "get_net_worth", "status": "started"}
    assert citation == {"source": "holdings", "as_of": "2026-09-20T00:00:00Z"}
    assert proposal["entity"] == "goal"
    assert "user_id" not in proposal
    assert "user_id" not in str(proposal)


def test_propose_action_rejects_malformed_or_identity_bearing_actions():
    from agent import tools

    with pytest.raises(ValueError):
        tools.propose_action("profile", "delete", payload={})
    with pytest.raises(ValueError):
        tools.propose_action("user", "create", payload={"name": "x"})
    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"user_id": "victim"})


def test_metadata_rejects_unknown_tools_aliases_secrets_raw_values_and_oversize():
    from agent import tools

    with pytest.raises(ValueError):
        tools.record_activity("made_up_tool", "started")
    with pytest.raises(ValueError):
        tools.record_citation("account_number=123456789012", "2026-09-20")
    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"userId": "victim"})
    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"result": "raw tool output"})
    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"name": "x" * 501})


def test_proposals_use_entity_specific_api_fields_and_reject_secret_phrases():
    from agent import tools

    valid = tools.propose_action(
        "goal", "create", payload={"name": "Car", "goal_type": "CAR",
                                      "amount_today_paise": 5000000, "target_age": 35},
        tool_context=SimpleNamespace(invocation_state={"message": "Please create a Car goal at age 35"})
    )
    assert valid["payload"]["target_age"] == 35
    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"api_key": "abc"})
    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"name": "my secret is abc"}, tool_context=SimpleNamespace(invocation_state={"message": "create a goal"}))
    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"note": "complete tool output: holdings"}, tool_context=SimpleNamespace(invocation_state={"message": "create a goal"}))


def test_free_text_action_names_must_come_from_current_user_message():
    from agent import tools

    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"name": "Car"}, tool_context=SimpleNamespace(invocation_state={"message": "create a Wedding goal"}))
    valid = tools.propose_action("goal", "create", payload={"name": "Wedding"}, tool_context=SimpleNamespace(invocation_state={"message": "create a Wedding goal"}))
    assert valid["payload"]["name"] == "Wedding"


def test_citations_allow_safe_firecrawl_fields_but_reject_raw_labels():
    from agent import tools

    citation = tools.record_citation(
        "Firecrawl", "2026-09-20", title="RBI rules", domain="rbi.org.in",
        url="https://rbi.org.in/rules", citation_id="result-1"
    )
    assert citation["domain"] == "rbi.org.in"
    assert citation["id"] == "result-1"
    with pytest.raises(ValueError):
        tools.record_citation("Firecrawl", "2026-09-20", url="https://rbi.org.in/rules")
    with pytest.raises(ValueError):
        tools.record_citation("my secret is abc", "2026-09-20")
    with pytest.raises(ValueError):
        tools.record_citation("api_key", "2026-09-20")
    with pytest.raises(ValueError):
        tools.record_citation("Firecrawl", "2026-09-20", title="complete tool output holdings allocation")


def test_activity_allows_a_safe_external_tool_name_without_a_secret_lookup(monkeypatch):
    """External activity must not fail just because registry discovery is lazy."""
    import integrations.firecrawl as firecrawl_mod
    import integrations.upstox as upstox_mod
    from agent import tools

    def _boom(*_args, **_kwargs):  # pragma: no cover - only runs on regression
        raise AssertionError("recording activity must never reach Secrets Manager")

    monkeypatch.setattr(firecrawl_mod, "_secret_token", _boom)
    monkeypatch.setattr(upstox_mod, "_secret_token", _boom)
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    monkeypatch.delenv("UPSTOX_ANALYTICS_TOKEN", raising=False)

    for name in ("web_search", "read_web_page", "search_securities", "get_mutual_fund_nav"):
        assert tools.record_activity(name, "started") == {"tool": name, "status": "started"}
    assert tools.record_activity("web_search", "completed")["status"] == "completed"
    with pytest.raises(ValueError):
        tools.record_activity("web_search", "pending")
    with pytest.raises(ValueError):
        tools.record_activity("exfiltrate_everything", "started")


def test_activity_allowlist_matches_the_real_external_registry():
    """The static allowlist must not drift away from the lazily-loaded tools."""
    from agent import tools

    external = set(tools.get_tool_registry(
        include_external=True,
        external_clients={"upstox": object(), "firecrawl": object()},
    )) - set(tools.get_tool_registry())
    assert external == set(tools.EXTERNAL_TOOL_NAMES)


def test_registry_exposes_grounded_calculators_and_account_reads():
    from agent import tools

    names = set(tools.get_tool_registry())
    assert {
        "get_profile", "get_holdings", "get_loans", "get_goals",
        "calculate_emi", "calculate_prepayment_impact",
        "estimate_income_tax", "compare_tax_regimes",
        "estimate_insurance_needs", "calculate_credit_card_payoff",
        "analyze_short_term_fit", "propose_profile_update",
    } <= names


def test_calculator_tool_converts_paise_inputs_at_model_boundary_and_rejects_bad_input():
    from agent import tools
    context = SimpleNamespace(invocation_state={"user_id": "u", "tracker": tools.ToolCallTracker()})
    result = tools.calculate_credit_card_payoff(
        outstanding_inr=1000, monthly_interest_pct=2, monthly_payment_inr=100,
        tool_context=context,
    )
    assert result["ok"] is True
    assert result["data"]["total_interest_inr"] >= 0
    invalid = tools.calculate_credit_card_payoff(
        outstanding_inr=-1, monthly_interest_pct=2, monthly_payment_inr=100,
        tool_context=context,
    )
    assert invalid["ok"] is False
    assert invalid["error_code"] == "VALIDATION_ERROR"


def test_prepayment_defaults_to_reduce_tenure_and_includes_charge():
    from agent import tools
    context = SimpleNamespace(invocation_state={"user_id": "u", "tracker": tools.ToolCallTracker()})
    result = tools.calculate_prepayment_impact(
        principal_inr=100000, annual_rate_pct=12, tenure_months=120,
        prepayment_inr=10000, prepayment_charge_pct=2, tool_context=context,
    )
    assert result["ok"] is True
    assert result["data"]["mode"] == "reduce_tenure"
    assert result["data"]["revised_tenure_months"] < 120
    assert result["data"]["prepayment_charge_inr"] == 200


def test_registered_proposals_have_concrete_model_signatures():
    import inspect
    from agent import tools
    for name in ("propose_profile_update", "propose_goal_update", "propose_transaction_category_change"):
        assert "*args" not in str(inspect.signature(tools.get_tool_registry()[name]))


@pytest.mark.parametrize("name, kwargs", [
    ("estimate_capital_gains_tax", {"gain_inr": "bad"}),
    ("calculate_credit_card_payoff", {"outstanding_inr": "bad", "monthly_interest_pct": 2, "monthly_payment_inr": 100}),
])
def test_malformed_calculator_inputs_return_validation_errors(name, kwargs):
    from agent import tools
    context = SimpleNamespace(invocation_state={"user_id": "u", "tracker": tools.ToolCallTracker()})
    result = tools.get_tool_registry()[name](tool_context=context, **kwargs)
    assert result["ok"] is False
    assert result["error_code"] == "VALIDATION_ERROR"


def test_engine_warnings_are_promoted_to_result_envelope():
    from agent import tools
    context = SimpleNamespace(invocation_state={"user_id": "u", "tracker": tools.ToolCallTracker()})
    result = tools.analyze_short_term_fit([100, 101], 12, tool_context=context)
    assert result["warnings"]


def test_market_and_research_tools_register_only_when_backing_credentials_exist(monkeypatch):
    from agent import tools
    monkeypatch.delenv("UPSTOX_ANALYTICS_TOKEN", raising=False)
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    names = set(tools.get_tool_registry(include_external=True))
    assert "search_securities" not in names
    assert "web_search" not in names
    monkeypatch.setenv("UPSTOX_ANALYTICS_TOKEN", "configured")
    monkeypatch.setenv("FIRECRAWL_API_KEY", "configured")
    names = set(tools.get_tool_registry(include_external=True))
    assert {"search_securities", "get_security_overview", "get_security_risk_metrics",
            "analyze_portfolio_fit", "get_security_news", "web_search", "read_web_page"} <= names


def test_external_tool_failures_use_truthful_safe_envelopes():
    from agent import tools
    class BrokenMarket:
        def search(self, *args, **kwargs): raise RuntimeError("secret transport detail")
        def overview(self, *args, **kwargs): raise ValueError("bad instrument")
    class BrokenResearch:
        def search(self, *args, **kwargs): raise RuntimeError("secret transport detail")
    class BrokenMf:
        def search_schemes(self, *args, **kwargs): raise RuntimeError("secret transport detail")
    ctx = SimpleNamespace(invocation_state={"user_id": "u", "tracker": tools.ToolCallTracker(),
                                             "upstox_client": BrokenMarket(),
                                             "firecrawl_client": BrokenResearch(),
                                             "mfapi_client": BrokenMf()})
    for result in (
        tools.search_securities("nifty", tool_context=ctx),
        tools.get_security_overview("NSE_EQ|INE", tool_context=ctx),
        tools.web_search("RBI inflation", tool_context=ctx),
        tools.search_mutual_funds("index", tool_context=ctx),
    ):
        assert result["ok"] is False
        assert result["error_code"] in {"UPSTREAM_UNAVAILABLE", "VALIDATION_ERROR"}
        assert "secret" not in result["message"].lower()


def test_mutual_fund_tools_register_and_preserve_source_as_of(monkeypatch):
    from agent import tools
    class Mf:
        def search_schemes(self, query, limit=10):
            return {"source": "mfapi.in", "as_of": "2026-09-20", "warnings": [],
                    "data": [{"scheme_code": "1", "scheme_name": "Index"}]}
        def latest_nav(self, code):
            return {"source": "mfapi.in", "as_of": "2026-09-20", "warnings": [],
                    "data": {"scheme_code": code, "nav_inr": 10.0}}
    ctx = SimpleNamespace(invocation_state={"user_id": "u", "tracker": tools.ToolCallTracker(), "mfapi_client": Mf()})
    assert tools.search_mutual_funds("index", tool_context=ctx)["source"] == "mfapi.in"
    assert tools.get_mutual_fund_nav("1", tool_context=ctx)["as_of"] == "2026-09-20"
    names = set(tools.get_tool_registry(include_external=True, external_clients={"mfapi": Mf()}))
    assert {"search_mutual_funds", "get_mutual_fund_nav"} <= names


def test_research_client_is_created_once_per_job_and_never_shared_across_jobs(monkeypatch):
    """Without an injected client, the tool layer must still keep one guard per job."""
    import integrations.firecrawl as firecrawl_mod
    from agent import tools
    from agent.research_safety import ResearchGuard

    built = []

    class FakeClient:
        def __init__(self, http, api_key, guard=None, base_url=None):
            self.guard = guard or ResearchGuard(max_searches=1, max_reads=8)
            built.append(self)

        def search(self, query, source="web", recency=None, country="IN"):
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

    job_one = SimpleNamespace(invocation_state={"user_id": "u", "tracker": tools.ToolCallTracker()})
    first = tools.web_search("latest RBI inflation guidance", tool_context=job_one)
    assert first["source"] == "Firecrawl"
    capped = tools.web_search("latest RBI repo guidance", tool_context=job_one)
    assert capped["ok"] is False and capped["error_code"] == "UPSTREAM_UNAVAILABLE"
    read = tools.read_web_page("r1", tool_context=job_one)
    assert read["data"]["url"] == "https://rbi.org.in/rules"
    assert len(built) == 1

    job_two = SimpleNamespace(invocation_state={"user_id": "u", "tracker": tools.ToolCallTracker()})
    foreign = tools.read_web_page("r1", tool_context=job_two)
    assert foreign["ok"] is False and foreign["error_code"] == "VALIDATION_ERROR"
    assert len(built) == 2
