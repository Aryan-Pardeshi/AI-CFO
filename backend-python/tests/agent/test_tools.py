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
