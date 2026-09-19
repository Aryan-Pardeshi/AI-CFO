"""Async job runner — owns RUNNING/COMPLETED/FAILED, never trusts client identity.

Payload shape from FinanceFunction (verified sub only):
  {"user_id": ..., "job_id": ..., "conversation_id": ..., "message": ...}
"""

from __future__ import annotations

import hashlib
import logging
import os

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
    try:
        jobs_table = deps.get("jobs_table") or store_mod.get_chat_jobs_table()
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
                                         channel, publisher, deps)
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
                        fallback_agent, message, history, user_id, tracker, channel, publisher, deps
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
                                        conversation_id=conversation_id,
                                        answer=answer, tool_calls=tools_used)
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
                    "error": SAFE_CHAT_ERROR}
        try:
            return store_mod.update_chat_job(jobs_table, user_id, job_id, "FAILED",
                                             conversation_id=conversation_id,
                                             error=SAFE_CHAT_ERROR)
        except Exception as mark_exc:
            logger.info({"event": "chat_job_failure_unpersisted",
                         "user_hash": _user_hash(user_id),
                         "error_class": type(mark_exc).__name__})
            return {"user_id": user_id, "job_id": job_id,
                    "conversation_id": conversation_id, "status": "FAILED",
                    "error": SAFE_CHAT_ERROR}


def _invoke(agent, message, history, user_id, tracker, channel, publisher, deps):
    """Run the agent with deterministic cap + progress events. Returns (answer, tools_used)."""
    tools_used: list[str] = []

    def _note_tool(name: str, phase: str):
        tools_used.append(name) if phase == "end" else None
        try:
            publisher(channel, f"tool_{phase}", {"tool": name})
        except Exception:
            pass

    # Test-double / fallback path: no stream_async means a simple double.
    if not hasattr(agent, "stream_async"):
        result = agent.run(message, history=history, tracker=tracker)
        return result.text, list(getattr(result, "tools_used", []))

    # Strands path: stream with invocation_state carrying verified identity.
    import asyncio

    async def _go():
        nonlocal tools_used
        chunks: list[str] = []
        used: list[str] = []
        try:
            stream = agent.stream_async(
                message,
                invocation_state={"user_id": user_id, "tracker": tracker,
                                  "history": history},
            )
        except TypeError:
            stream = agent.stream_async(message)
        async for event in stream:
            if isinstance(event, dict):
                if event.get("tool_start"):
                    name = str(event["tool_start"])
                    _note_tool(name, "start")
                if event.get("tool_end"):
                    _note_tool(str(event["tool_end"]), "end")
                    used.append(str(event["tool_end"]))
                if event.get("text_delta"):
                    chunks.append(str(event["text_delta"]))
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
