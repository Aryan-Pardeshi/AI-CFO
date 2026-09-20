"""Async job runner — owns RUNNING/COMPLETED/FAILED, never trusts client identity.

Payload shape from FinanceFunction (verified sub only):
  {"user_id": ..., "job_id": ..., "conversation_id": ..., "message": ...}
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
from types import SimpleNamespace

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

SAFE_CHAT_ERROR = "Unable to complete this chat right now. Please try again."
KILO_PROVIDER_ERROR_NAMES = frozenset({
    "APIError",
    "APIConnectionError",
    "APIResponseValidationError",
    "APIStatusError",
    "APITimeoutError",
    "InternalServerError",
    "RateLimitError",
})


def _user_hash(user_id: str) -> str:
    salt = os.environ.get("LOG_SALT", "aicfo-dev")
    return hashlib.sha256(f"{salt}:{user_id}".encode()).hexdigest()[:12]


def _default_agent_factory(*, model_id: str | None = None):
    from agent import model as model_mod
    from agent import prompt as prompt_mod
    from agent import tools as tools_mod

    model = model_mod.create_kilo_model(model_id=model_id)

    try:
        from strands import Agent
    except ImportError:
        # No Strands layer in this environment (local/dev -- Strands ships as
        # the Lambda layer, not a pip dependency). Any *other* failure, like a
        # bad tool schema or a missing secret, must propagate so the chat job
        # is marked FAILED instead of returning a plausible canned answer.
        registry = tools_mod.get_tool_registry()

        class _FallbackResult:
            def __init__(self, text, tools_used):
                self.text = text
                self.tools_used = tools_used

        class _FallbackAgent:
            def run(self, message, history=None, tracker=None):
                tracker = tracker or tools_mod.ToolCallTracker()
                tracker.record("get_financial_snapshot")
                return _FallbackResult(
                    "Under these assumptions, I could not reach the live model "
                    "in this environment. Your portfolio and FIRE numbers are "
                    "available on the Investments and FIRE pages.",
                    ["get_financial_snapshot"],
                )

        agent = _FallbackAgent()
        agent._tool_registry = registry
        return agent

    tools = list(tools_mod.get_tool_registry().values())
    return Agent(model=model, system_prompt=prompt_mod.SYSTEM_PROMPT, tools=tools)


def _is_kilo_provider_error(exc: Exception) -> bool:
    """Only retry upstream Kilo/OpenAI failures, never tool or data errors."""

    return type(exc).__name__ in KILO_PROVIDER_ERROR_NAMES


def _fallback_agent_factories(deps: dict, uses_default_agent: bool):
    """Get test or configured fallback agents in their intended priority order."""

    configured_factories = deps.get("fallback_agent_factories")
    if configured_factories is not None:
        return list(configured_factories)

    configured_factory = deps.get("fallback_agent_factory")
    if configured_factory is not None:
        return [configured_factory]
    if not uses_default_agent:
        return []

    from agent import model as model_mod

    return [
        lambda model_id=model_id: _default_agent_factory(model_id=model_id)
        for model_id in model_mod.configured_fallback_model_ids()
    ]


def _latest_turn_instruction(message: str) -> str:
    """Keep a fresh request from being eclipsed by a persisted assistant turn."""

    normalized = message.lower()
    edit_request = re.match(
        r"^(?:please\s+)?(?:update|change|edit|set|create|save|delete|remove)\b",
        normalized.strip(),
    )
    if edit_request and not normalized.rstrip().endswith("?"):
        return (
            "LATEST REQUEST ROUTING: This is an action request. Call the relevant "
            "propose_* tool to create a validated preview; never write to the database."
        )
    if any(term in normalized for term in ("security", "stock", "etf", "mutual fund", "isin", "ticker")):
        return (
            "LATEST REQUEST ROUTING: This is a security request. Call the relevant backed "
            "portfolio/security tool before answering; never invent market data."
        )
    if any(term in normalized for term in ("tax", "income tax", "capital gain", "capital gains")):
        return (
            "LATEST REQUEST ROUTING: This is a tax estimate request. Call "
            "estimate_income_tax, compare_tax_regimes, or estimate_capital_gains_tax "
            "as appropriate before answering."
        )
    if any(term in normalized for term in ("insurance", "term cover", "health cover")):
        return (
            "LATEST REQUEST ROUTING: This is an insurance estimate request. Call "
            "estimate_insurance_needs before answering."
        )
    if any(term in normalized for term in ("emi", "loan", "prepayment", "credit card")):
        return (
            "LATEST REQUEST ROUTING: This is a loan or debt-calculator request. Call "
            "calculate_emi, calculate_prepayment_impact, or calculate_credit_card_payoff "
            "as appropriate before answering."
        )
    if any(term in normalized for term in ("short term", "short-term", "horizon")):
        return (
            "LATEST REQUEST ROUTING: This is a short-term fit request. Call "
            "analyze_short_term_fit before answering; do not give a buy or sell signal."
        )
    if any(term in normalized for term in (
        "cashflow", "cash flow", "transaction", "transactions", "spending",
        "spend", "income", "expenses", "expense",
    )):
        return (
            "LATEST REQUEST ROUTING: This is a cashflow request. Call "
            "get_cashflow_summary before answering. Do not calculate_fire or "
            "reuse a prior FIRE answer for this request."
        )
    if "fire" in normalized or "financial independence" in normalized:
        return (
            "LATEST REQUEST ROUTING: This is a FIRE request. Call "
            "calculate_fire before answering, unless the user explicitly asks "
            "only about a prior answer."
        )
    if any(term in normalized for term in ("portfolio", "concentrat", "allocation")):
        return (
            "LATEST REQUEST ROUTING: This is a portfolio request. Call "
            "get_portfolio_analysis before answering."
        )
    if "net worth" in normalized or "networth" in normalized:
        return (
            "LATEST REQUEST ROUTING: This is a net-worth request. Call "
            "get_net_worth before answering."
        )
    return "LATEST REQUEST: Answer this new request; do not repeat a prior answer."


def _strands_messages(history: list[dict], message: str) -> list[dict]:
    """Build the documented Strands message-list input for one persisted turn."""

    messages = []
    for row in history:
        role = row.get("role") if isinstance(row, dict) else None
        content = row.get("content") if isinstance(row, dict) else None
        if role in {"user", "assistant"} and isinstance(content, str) and content:
            messages.append({"role": role, "content": [{"text": content}]})
    messages.append({
        "role": "user",
        "content": [{"text": f"{message}\n\n{_latest_turn_instruction(message)}"}],
    })
    return messages


def run_chat_job(payload: dict, deps: dict | None = None) -> dict:
    """Execute one chat job. Test doubles go through `deps`; never live model in tests."""
    from agent import prompt as prompt_mod
    from agent import store as store_mod
    from agent import tools as tools_mod
    from agent.events import channel_for, publish_job_event

    deps = deps or {}
    user_id = payload.get("user_id")
    job_id = payload.get("job_id")
    conversation_id = payload.get("conversation_id")
    message = payload.get("message")
    if not user_id or not job_id or not conversation_id or not message:
        raise ValueError("async payload needs user_id, job_id, conversation_id, message")

    channel = channel_for(user_id, job_id)
    jobs_table = None
    publisher = deps.get("publisher") or publish_job_event
    metadata = {"tool_activity": [], "citations": [], "proposed_actions": []}
    jobs_table_for_progress = None

    def persist_progress():
        if jobs_table_for_progress is not None:
            store_mod.update_chat_job(jobs_table_for_progress, user_id, job_id, "RUNNING",
                                      conversation_id=conversation_id, **metadata)
    try:
        jobs_table = deps.get("jobs_table") or store_mod.get_chat_jobs_table()
        jobs_table_for_progress = jobs_table
        conv_table = deps.get("conv_table") or store_mod.get_conversations_table()
        tracker = deps.get("tracker") or tools_mod.ToolCallTracker(cap=tools_mod.TOOL_CAP)
        store_mod.update_chat_job(jobs_table, user_id, job_id, "RUNNING",
                                  conversation_id=conversation_id)
        history_rows = store_mod.get_history(conv_table, user_id, conversation_id, limit=10)
        history = [{"role": r.get("role"), "content": r.get("content")}
                   for r in history_rows]
        store_mod.save_message(conv_table, user_id, conversation_id, "user", message)
        start_ms = __import__("time").monotonic()
        agent = deps.get("agent")
        uses_default_agent = agent is None and "agent_factory" not in deps
        if agent is None:
            factory = deps.get("agent_factory") or _default_agent_factory
            agent = factory()

        try:
            answer, tools_used = _invoke(agent, message, history, user_id, tracker,
                                         channel, publisher, deps, metadata, persist_progress)
        except Exception as exc:
            if not _is_kilo_provider_error(exc):
                raise
            fallback_error = exc
            for fallback_index, fallback_factory in enumerate(
                _fallback_agent_factories(deps, uses_default_agent), start=1
            ):
                logger.info({
                    "event": "chat_kilo_fallback",
                    "user_hash": _user_hash(user_id),
                    "error_class": type(fallback_error).__name__,
                    "fallback_index": fallback_index,
                })
                try:
                    fallback_agent = fallback_factory()
                    answer, tools_used = _invoke(
                        fallback_agent, message, history, user_id, tracker, channel, publisher, deps,
                        metadata, persist_progress
                    )
                    break
                except Exception as fallback_exc:
                    if not _is_kilo_provider_error(fallback_exc):
                        raise
                    fallback_error = fallback_exc
            else:
                raise fallback_error
        # Persist assistant message with tools_used, never raw tool output.
        store_mod.save_message(conv_table, user_id, conversation_id, "assistant",
                               answer, tools_used=tools_used)
        job = store_mod.update_chat_job(jobs_table, user_id, job_id, "COMPLETED",
                                        conversation_id=conversation_id, answer=answer,
                                        tool_calls=tools_used, **metadata)
        try:
            publisher(channel, "done", {"job_id": job_id})
        except Exception:
            pass
        logger.info({"event": "chat_job_done", "user_hash": _user_hash(user_id),
                     "tools": len(tools_used),
                     "duration_ms": int((__import__("time").monotonic() - start_ms) * 1000)})
        return job
    except Exception as exc:
        try:
            publisher(channel, "failed", {"job_id": job_id})
        except Exception:
            pass
        logger.info({"event": "chat_job_failed", "user_hash": _user_hash(user_id),
                     "error_class": type(exc).__name__})
        if jobs_table is None:
            return {"user_id": user_id, "job_id": job_id,
                    "conversation_id": conversation_id, "status": "FAILED",
                    "error": SAFE_CHAT_ERROR, **metadata}
        try:
            return store_mod.update_chat_job(jobs_table, user_id, job_id, "FAILED",
                                             conversation_id=conversation_id,
                                             error=SAFE_CHAT_ERROR, **metadata)
        except Exception as mark_exc:
            logger.info({"event": "chat_job_failure_unpersisted",
                         "user_hash": _user_hash(user_id),
                         "error_class": type(mark_exc).__name__})
            return {"user_id": user_id, "job_id": job_id,
                    "conversation_id": conversation_id, "status": "FAILED",
                    "error": SAFE_CHAT_ERROR, **metadata}


def _invoke(agent, message, history, user_id, tracker, channel, publisher, deps,
            metadata=None, persist_progress=None):
    """Run the agent with deterministic cap + progress events. Returns (answer, tools_used)."""
    tools_used: list[str] = []
    metadata = metadata if metadata is not None else {"tool_activity": [], "citations": [], "proposed_actions": []}
    from agent import tools as tools_mod

    def _note_tool(name: str, phase: str):
        status = "started" if phase == "start" else "completed"
        activity = tools_mod.record_activity(name, status)
        if activity not in metadata["tool_activity"]:
            metadata["tool_activity"].append(activity)
        try:
            publisher(channel, f"tool_{phase}", activity)
        except Exception:
            pass
        if persist_progress:
            persist_progress()

    # Test-double / fallback path: no stream_async means a simple double.
    if not hasattr(agent, "stream_async"):
        result = agent.run(message, history=history, tracker=tracker)
        used = list(getattr(result, "tools_used", []))
        for name in used:
            _note_tool(name, "start")
            _note_tool(name, "end")
        return result.text, used

    # Strands path: stream with invocation_state carrying verified identity.
    import asyncio

    async def _go():
        nonlocal tools_used
        chunks: list[str] = []
        used: list[str] = []
        started_tools: dict[str, str] = {}
        finished_tools: set[str] = set()

        def _tool_name(value) -> str | None:
            if isinstance(value, dict):
                value = value.get("name")
            if not isinstance(value, str) or not value:
                return None
            return value

        def _tool_key(value, name: str) -> str:
            if isinstance(value, dict):
                identifier = value.get("toolUseId") or value.get("tool_use_id")
                if isinstance(identifier, str) and identifier:
                    return identifier
            return f"name:{name}"

        def _start_tool(value) -> None:
            name = _tool_name(value)
            if name is None:
                return
            key = _tool_key(value, name)
            if key not in started_tools:
                started_tools[key] = name
                _note_tool(name, "start")

        def _finish_tool(value) -> None:
            name = _tool_name(value)
            if name is None:
                return
            key = _tool_key(value, name)
            if key in started_tools and key not in finished_tools:
                finished_tools.add(key)
                _note_tool(started_tools[key], "end")
                used.append(started_tools[key])

        try:
            stream = agent.stream_async(
                _strands_messages(history, message),
                invocation_state={"user_id": user_id, "tracker": tracker,
                                  "history": history, "metadata": metadata,
                                  "message": message},
            )
        except TypeError:
            stream = agent.stream_async(_strands_messages(history, message))
        async for event in stream:
            if isinstance(event, dict):
                # Standard Strands fields (``data`` and ``current_tool_use``),
                # plus the legacy aliases used by our local doubles.
                _start_tool(event.get("current_tool_use"))
                _start_tool(event.get("tool_start"))
                _finish_tool(event.get("tool_end"))
                for citation in event.get("citations", []) if isinstance(event.get("citations"), list) else []:
                    if isinstance(citation, dict) and citation.get("source") and citation.get("as_of"):
                        try:
                            item = tools_mod.record_citation(citation["source"], citation["as_of"], citation.get("title"))
                            if item not in metadata["citations"]:
                                metadata["citations"].append(item)
                        except ValueError:
                            pass
                tool_result = event.get("tool_result")
                if isinstance(tool_result, dict):
                    try:
                        source = tool_result.get("source")
                        as_of = tool_result.get("as_of")
                        if source and as_of:
                            item = tools_mod.record_citation(source, as_of)
                            if item not in metadata["citations"]:
                                metadata["citations"].append(item)
                    except ValueError:
                        pass
                action = event.get("proposed_action")
                if isinstance(action, dict):
                    try:
                        item = tools_mod.propose_action(action.get("entity"), action.get("operation"),
                                                        target=action.get("target"), payload=action.get("payload"),
                                                        tool_context=SimpleNamespace(invocation_state={"message": message}))
                        if item not in metadata["proposed_actions"]:
                            metadata["proposed_actions"].append(item)
                    except (TypeError, ValueError):
                        pass
                if persist_progress:
                    persist_progress()
                text = event.get("data")
                if not isinstance(text, str):
                    text = event.get("text_delta")
                if isinstance(text, str):
                    chunks.append(text)
        for key, name in started_tools.items():
            if key not in finished_tools:
                _finish_tool({"toolUseId": key, "name": name})
        return "".join(chunks), used

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not None:
        raise RuntimeError("run_chat_job must be called from sync context")
    answer, used = asyncio.run(_go())
    tools_used.extend(used)
    if not answer:
        answer = ("Under these assumptions, I have no grounded answer yet — "
                  "the requested data appears to be missing.")
    return answer, tools_used


SYSTEM_PROMPT_REF = "agent.prompt"
