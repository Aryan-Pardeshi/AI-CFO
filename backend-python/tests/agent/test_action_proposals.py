from types import SimpleNamespace


def test_proposal_helpers_return_preview_and_never_write():
    from agent.action_proposals import propose_profile_update, propose_holdings_update

    context = SimpleNamespace(invocation_state={"message": "Set my monthly income to 80000"})
    profile = propose_profile_update({"monthly_income_paise": 8000000}, tool_context=context)
    assert profile["preview"] is True
    assert profile["operation"] == "update"
    assert profile["payload"]["monthly_income_paise"] == 8000000
    assert "table" not in profile
    holding = propose_holdings_update("h-1", {"quantity": 2}, tool_context=context)
    assert holding["preview"] is True
    assert holding["target"] == "h-1"


def test_proposal_helpers_validate_payloads():
    import pytest
    from agent.action_proposals import propose_goal_update

    with pytest.raises(ValueError):
        propose_goal_update("g-1", {"amount_today_paise": -1})
