"""Kilo Gateway model factory for the Strands chat agent.

The API key is loaded at runtime from Secrets Manager. No secret is placed in
Lambda environment variables, source, or logs. Imports stay lazy so the pure
Python test suite does not need the Lambda Strands layer installed.
"""

from __future__ import annotations

import json
import os
from typing import Callable

KILO_BASE_URL_DEFAULT = "https://openrouter.ai/api/v1"
KILO_MODEL_ID_DEFAULT = "z-ai/glm-5.3-flash"
KILO_FALLBACK_MODEL_ID_DEFAULT = ""
KILO_SECOND_FALLBACK_MODEL_ID_DEFAULT = ""
KILO_SECRET_ID_DEFAULT = "aicfo/openrouter"
KILO_TEMPERATURE = 0.2
KILO_MAX_TOKENS = 2000


def configured_model_id() -> str:
    return os.environ.get("KILO_MODEL_ID", KILO_MODEL_ID_DEFAULT)


def configured_fallback_model_id() -> str:
    return os.environ.get("KILO_FALLBACK_MODEL_ID", KILO_FALLBACK_MODEL_ID_DEFAULT)


def configured_second_fallback_model_id() -> str:
    return os.environ.get(
        "KILO_SECOND_FALLBACK_MODEL_ID", KILO_SECOND_FALLBACK_MODEL_ID_DEFAULT
    )


def configured_fallback_model_ids() -> tuple[str, ...]:
    """Return unique provider fallbacks in configured order, never the primary."""

    primary = configured_model_id()
    candidates = (
        configured_fallback_model_id(),
        configured_second_fallback_model_id(),
    )
    return tuple(dict.fromkeys(model_id for model_id in candidates if model_id and model_id != primary))


def _load_kilo_api_key(secret_id: str = KILO_SECRET_ID_DEFAULT) -> str:
    """Read ``{"api_key": "..."}`` from Secrets Manager at invocation time."""

    import boto3

    response = boto3.client("secretsmanager").get_secret_value(SecretId=secret_id)
    secret_string = response.get("SecretString")
    if not secret_string:
        raise RuntimeError("Kilo API key secret is empty")
    try:
        secret = json.loads(secret_string)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Kilo API key secret is not valid JSON") from exc
    api_key = secret.get("api_key") if isinstance(secret, dict) else None
    if not isinstance(api_key, str) or not api_key:
        raise RuntimeError("Kilo API key is missing from Secrets Manager")
    return api_key


def create_kilo_model(
    model_cls=None,
    *,
    api_key: str | None = None,
    secret_loader: Callable[[str], str] | None = None,
    model_id: str | None = None,
):
    """Build the Strands OpenAI-compatible model pointed at Kilo.

    ``api_key`` and ``secret_loader`` are test seams. Production calls load
    the key directly from the ``aicfo/kilo`` Secrets Manager secret.
    """

    if model_cls is None:
        from strands.models.openai import OpenAIModel  # lazy: Lambda layer only

        model_cls = OpenAIModel
    if api_key is None:
        loader = secret_loader or _load_kilo_api_key
        api_key = loader(os.environ.get("KILO_SECRET_ID", KILO_SECRET_ID_DEFAULT))
    if not api_key:
        raise ValueError("Kilo API key is required")

    return model_cls(
        client_args={
            "api_key": api_key,
            "base_url": os.environ.get("KILO_BASE_URL", KILO_BASE_URL_DEFAULT),
        },
        model_id=model_id or configured_model_id(),
        params={"temperature": KILO_TEMPERATURE, "max_tokens": KILO_MAX_TOKENS},
    )
