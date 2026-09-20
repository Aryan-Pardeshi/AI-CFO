import pytest


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
                                      "amount_today_paise": 5000000, "target_age": 35}
    )
    assert valid["payload"]["target_age"] == 35
    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"api_key": "abc"})
    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"name": "my secret is abc"})
    with pytest.raises(ValueError):
        tools.propose_action("goal", "create", payload={"note": "complete tool output: holdings"})


def test_citations_allow_safe_firecrawl_fields_but_reject_raw_labels():
    from agent import tools

    citation = tools.record_citation(
        "Firecrawl", "2026-09-20", title="RBI rules", domain="rbi.org.in",
        url="https://rbi.org.in/rules"
    )
    assert citation["domain"] == "rbi.org.in"
    with pytest.raises(ValueError):
        tools.record_citation("my secret is abc", "2026-09-20")
    with pytest.raises(ValueError):
        tools.record_citation("api_key", "2026-09-20")
