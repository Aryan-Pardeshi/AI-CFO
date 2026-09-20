"""Upstox integration module for market quotes, historical candles, and instrument search.

Per .agents/agent-guide.md:
- Upstox is the primary market data provider for Indian stocks and ETFs.
- Analytics Token is read-only, stored in Secrets Manager `aicfo/upstox` as {"analytics_token": "..."}.
- Full Market Quote V3: GET /market-quote/quotes, up to 500 instrument keys per call.
- Historical Candle V3: GET /historical-candle/{instrument_key}/{interval}/{to_date}/{from_date}.
- Instrument master: daily gzip JSON at assets.upstox.com/market-quote/instruments/exchange/.
  The local instruments_index.json is strictly a temporary development fixture (34 top NSE names).
- All monetary values are integer paise.
- Never fabricate prices, fundamentals, or history in production application code.
  When upstream is unavailable or token is missing, raise SecurityUpstreamError (502).
"""

from __future__ import annotations

import json
import logging
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

UPSTOX_SECRET_ID_DEFAULT = "aicfo/upstox"
UPSTOX_API_BASE = "https://api.upstox.com/v2"

# Temporary development fixture path (34 top NSE equities/ETFs)
DEV_FIXTURE_INDEX_PATH = os.path.join(os.path.dirname(__file__), "instruments_index.json")
# Production daily instrument master path (downloaded daily ~6 AM IST per agent-guide.md)
PROD_INSTRUMENT_MASTER_PATH = os.environ.get("UPSTOX_INSTRUMENT_MASTER_PATH", "/tmp/upstox_instruments.json")


class SecurityError(Exception):
    """Base exception for securities operations."""
    pass


class SecurityValidationError(SecurityError):
    """Validation error (400)."""
    pass


class SecurityNotFoundError(SecurityError):
    """Security not found (404)."""
    pass


class SecurityUpstreamError(SecurityError):
    """Upstream provider error (502)."""
    pass


_instruments_cache: list[dict[str, Any]] | None = None
_token_cache: str | None = None


def load_instruments_index() -> list[dict[str, Any]]:
    """Load instruments index.

    Checks PROD_INSTRUMENT_MASTER_PATH first; falls back to the labeled
    DEV_FIXTURE_INDEX_PATH for local development and test environments.
    """
    global _instruments_cache
    if _instruments_cache is not None:
        return _instruments_cache

    # 1. Try production daily instrument master if present
    if os.path.exists(PROD_INSTRUMENT_MASTER_PATH):
        try:
            with open(PROD_INSTRUMENT_MASTER_PATH, "r", encoding="utf-8") as f:
                _instruments_cache = json.load(f)
                return _instruments_cache or []
        except Exception as exc:
            logger.warning("Failed to load production instrument master from %s: %s", PROD_INSTRUMENT_MASTER_PATH, exc)

    # 2. Fall back to labeled development fixture
    if not os.path.exists(DEV_FIXTURE_INDEX_PATH):
        logger.warning("Development instrument fixture not found at %s", DEV_FIXTURE_INDEX_PATH)
        return []
    try:
        with open(DEV_FIXTURE_INDEX_PATH, "r", encoding="utf-8") as f:
            _instruments_cache = json.load(f)
            return _instruments_cache or []
    except Exception as exc:
        logger.error("Failed to load development instrument fixture: %s", exc)
        return []


def find_instrument(instrument_key: str) -> dict[str, Any] | None:
    """Find an instrument by instrument_key or normalized symbol/key."""
    instruments = load_instruments_index()
    norm_key = instrument_key.strip()
    # Try exact match first
    for inst in instruments:
        if inst.get("instrument_key") == norm_key:
            return inst
    # Try matching without exchange prefix or alternative colon separator
    alt_key = norm_key.replace(":", "|")
    for inst in instruments:
        if inst.get("instrument_key") == alt_key:
            return inst
    # Try matching symbol
    norm_sym = norm_key.upper().split("|")[-1].split(":")[-1]
    for inst in instruments:
        if (inst.get("symbol") or "").upper() == norm_sym:
            return inst
    return None


def _load_upstox_token(secret_id: str = UPSTOX_SECRET_ID_DEFAULT) -> str | None:
    """Read analytics_token from env var or Secrets Manager."""
    global _token_cache
    env_token = os.environ.get("UPSTOX_ANALYTICS_TOKEN")
    if env_token:
        return env_token.strip()

    if _token_cache:
        return _token_cache

    try:
        import boto3
        client = boto3.client("secretsmanager")
        resp = client.get_secret_value(SecretId=secret_id)
        secret_str = resp.get("SecretString")
        if secret_str:
            data = json.loads(secret_str)
            token = data.get("analytics_token") or data.get("api_key")
            if token and isinstance(token, str):
                _token_cache = token.strip()
                return _token_cache
    except Exception as exc:
        logger.debug("Upstox token not available from Secrets Manager: %s", exc)
    return None


def reset_token_cache() -> None:
    """Reset the cached token (useful for tests)."""
    global _token_cache
    _token_cache = None


def search_securities(q: str, limit: int = 10) -> list[dict[str, Any]]:
    """Search Indian stocks and ETFs from the instrument index.

    Query matching prioritizes:
    1. Exact symbol match
    2. Symbol prefix match
    3. Symbol substring match
    4. Name token / substring match
    """
    if not q or not isinstance(q, str) or not q.strip():
        raise SecurityValidationError("Search query 'q' must be a non-empty string")
    query = q.strip().upper()
    if len(query) > 100:
        raise SecurityValidationError("Search query 'q' must not exceed 100 characters")

    instruments = load_instruments_index()
    exact_matches: list[dict[str, Any]] = []
    prefix_matches: list[dict[str, Any]] = []
    symbol_substr_matches: list[dict[str, Any]] = []
    name_matches: list[dict[str, Any]] = []

    for inst in instruments:
        sym = (inst.get("symbol") or "").upper()
        name = (inst.get("name") or "").upper()
        inst_key = (inst.get("instrument_key") or "").upper()

        if sym == query or inst_key == query:
            exact_matches.append(inst)
        elif sym.startswith(query):
            prefix_matches.append(inst)
        elif query in sym:
            symbol_substr_matches.append(inst)
        elif query in name:
            name_matches.append(inst)

    combined = exact_matches + prefix_matches + symbol_substr_matches + name_matches
    # Deduplicate while preserving ranking
    seen = set()
    deduped: list[dict[str, Any]] = []
    for item in combined:
        key = item.get("instrument_key")
        if key and key not in seen:
            seen.add(key)
            deduped.append(item)

    safe_limit = max(1, min(limit, 20))
    selected = deduped[:safe_limit]

    # Try attaching quotes if Upstox token is available
    token = _load_upstox_token()
    quotes_by_key = {}
    if token and selected:
        try:
            quotes_by_key = _fetch_upstox_quotes([item["instrument_key"] for item in selected], token)
        except Exception as exc:
            logger.debug("Failed to fetch search result quotes from Upstox: %s", exc)
            quotes_by_key = {}

    results: list[dict[str, Any]] = []
    for item in selected:
        key = item["instrument_key"]
        quote = quotes_by_key.get(key)
        res = {
            "instrument_key": key,
            "symbol": item["symbol"],
            "name": item["name"],
            "asset_type": item["asset_type"],
            "exchange": item.get("exchange", "NSE"),
            "isin": item.get("isin"),
            "sector": item.get("sector"),
            "price_paise": quote.get("last_price_paise") if quote else None,
            "change_paise": quote.get("change_paise") if quote else None,
            "change_pct": quote.get("change_pct") if quote else None,
            "day_change_paise": quote.get("day_change_paise") if quote else None,
            "day_change_pct": quote.get("day_change_pct") if quote else None,
        }
        results.append(res)

    return results


def _fetch_upstox_quotes(instrument_keys: list[str], token: str) -> dict[str, dict[str, Any]]:
    """Fetch quotes from Upstox V3 quote API for up to 500 instrument keys."""
    if not instrument_keys or not token:
        return {}
    query_param = ",".join(instrument_keys)
    url = f"{UPSTOX_API_BASE}/market-quote/quotes?instrument_key={urllib.parse.quote(query_param, safe=',')}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "AI-CFO/1.0",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        raise SecurityUpstreamError(f"Upstox quote API error: {exc}") from exc

    raw_data = data.get("data") or {}
    results: dict[str, dict[str, Any]] = {}
    now_iso = datetime.now(timezone.utc).isoformat()

    for key, q in raw_data.items():
        if not q or not isinstance(q, dict):
            continue
        last_price = q.get("last_price")
        if last_price is None:
            continue
        ohlc = q.get("ohlc") or {}
        prev_close = q.get("prev_close_price") or ohlc.get("close") or last_price
        open_val = ohlc.get("open") or last_price
        high_val = ohlc.get("high") or last_price
        low_val = ohlc.get("low") or last_price

        last_price_paise = int(round(float(last_price) * 100))
        prev_close_paise = int(round(float(prev_close) * 100))
        open_paise = int(round(float(open_val) * 100))
        high_paise = int(round(float(high_val) * 100))
        low_paise = int(round(float(low_val) * 100))
        day_change_paise = last_price_paise - prev_close_paise
        day_change_pct = (
            round((day_change_paise / prev_close_paise) * 100, 2)
            if prev_close_paise > 0
            else 0.0
        )
        volume = int(q.get("volume") or 0)
        as_of = q.get("timestamp") or now_iso

        quote_dict = {
            "last_price_paise": last_price_paise,
            "change_paise": day_change_paise,
            "change_pct": day_change_pct,
            "day_change_paise": day_change_paise,
            "day_change_pct": day_change_pct,
            "open_paise": open_paise,
            "high_paise": high_paise,
            "low_paise": low_paise,
            "prev_close_paise": prev_close_paise,
            "volume": volume,
            "as_of": as_of,
        }
        # Upstox keys by e.g. NSE_EQ:RELIANCE or NSE_EQ|RELIANCE
        results[key] = quote_dict
        pipe_key = key.replace(":", "|")
        results[pipe_key] = quote_dict

    return results


def get_security_detail(instrument_key: str) -> dict[str, Any]:
    """Retrieve full security details, quote, performance, fundamentals, and source info.

    Returns the documented structure:
    {
      security: { instrument_key, symbol, name, asset_type, exchange, isin, sector },
      quote: { last_price_paise, change_paise, change_pct, ... },
      holding: null,
      performance: { ... },
      fundamentals: { ... },
      insights: [ ... ],
      source,
      as_of
    }
    """
    if not instrument_key or not isinstance(instrument_key, str) or not instrument_key.strip():
        raise SecurityValidationError("instrument_key is required")

    inst = find_instrument(instrument_key)
    if not inst:
        raise SecurityNotFoundError(f"Security '{instrument_key}' not found in instrument index")

    key = inst["instrument_key"]
    token = _load_upstox_token()
    if not token:
        raise SecurityUpstreamError("Upstox market data is unavailable (no analytics token configured)")

    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        quotes = _fetch_upstox_quotes([key], token)
        quote = quotes.get(key) or quotes.get(key.replace("|", ":"))
    except Exception as exc:
        logger.warning("Upstox quote fetch failed for %s: %s", key, exc)
        raise SecurityUpstreamError("Market data provider is currently unavailable") from exc

    if quote is None:
        raise SecurityUpstreamError(f"Market quote unavailable from Upstox for '{key}'")

    as_of = quote.get("as_of") or now_iso
    source = "UPSTOX"

    # Performance section
    performance = {
        "day_low_paise": quote.get("low_paise"),
        "day_high_paise": quote.get("high_paise"),
        "open_paise": quote.get("open_paise"),
        "prev_close_paise": quote.get("prev_close_paise"),
        "volume": quote.get("volume"),
        "week_52_low_paise": None,
        "week_52_high_paise": None,
    }

    # Fundamentals: only real available fields, never fabricated
    fundamentals: dict[str, Any] = {
        "pe_ratio": None,
        "pb_ratio": None,
        "market_cap_paise": None,
        "dividend_yield_pct": None,
        "aum_paise": None,
        "expense_ratio_pct": None,
        "nav_paise": None,
        "tracking_error_pct": None,
    }

    # Source-backed factual insights
    insights = []
    if quote.get("change_pct") is not None:
        pct = quote["change_pct"]
        direction = "up" if pct >= 0 else "down"
        insights.append({
            "title": "Day Performance",
            "description": f"{inst.get('symbol')} is {direction} {abs(pct):.2f}% today.",
        })
    if quote.get("volume"):
        insights.append({
            "title": "Trading Activity",
            "description": f"Recorded trading volume of {quote['volume']:,} shares.",
        })

    return {
        "security": {
            "instrument_key": key,
            "symbol": inst.get("symbol"),
            "name": inst.get("name"),
            "asset_type": inst.get("asset_type"),
            "exchange": inst.get("exchange", "NSE"),
            "isin": inst.get("isin"),
            "sector": inst.get("sector"),
        },
        "quote": quote,
        "holding": None,
        "performance": performance,
        "fundamentals": fundamentals,
        "insights": insights,
        "source": source,
        "as_of": as_of,
    }


def get_security_history(instrument_key: str, period: str = "1y") -> dict[str, Any]:
    """Retrieve historical candle points for an instrument.

    Supported periods: 1d, 3d, 1m, 6m, 1y, 3y, 5y.
    Candles are returned ordered chronologically (oldest first).
    """
    if not instrument_key or not isinstance(instrument_key, str) or not instrument_key.strip():
        raise SecurityValidationError("instrument_key is required")

    inst = find_instrument(instrument_key)
    if not inst:
        raise SecurityNotFoundError(f"Security '{instrument_key}' not found in instrument index")

    valid_periods = {"1d", "3d", "1m", "6m", "1y", "3y", "5y"}
    period_norm = (period or "1y").strip().lower()
    if period_norm not in valid_periods:
        raise SecurityValidationError(f"Invalid period '{period}'. Must be one of: {', '.join(sorted(valid_periods))}")

    key = inst["instrument_key"]
    token = _load_upstox_token()
    if not token:
        raise SecurityUpstreamError("Upstox market data is unavailable (no analytics token configured)")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    today_str = now.date().isoformat()

    # Determine interval and date range
    if period_norm == "1d":
        interval = "1minute"
        from_date = (now - timedelta(days=1)).date().isoformat()
    elif period_norm == "3d":
        interval = "30minute"
        from_date = (now - timedelta(days=4)).date().isoformat()
    elif period_norm == "1m":
        interval = "day"
        from_date = (now - timedelta(days=31)).date().isoformat()
    elif period_norm == "6m":
        interval = "day"
        from_date = (now - timedelta(days=183)).date().isoformat()
    elif period_norm == "1y":
        interval = "day"
        from_date = (now - timedelta(days=366)).date().isoformat()
    elif period_norm == "3y":
        interval = "day"
        from_date = (now - timedelta(days=1096)).date().isoformat()
    else:  # 5y
        interval = "day"
        from_date = (now - timedelta(days=1827)).date().isoformat()

    to_date = today_str

    # Upstox Historical Candle API: GET /v2/historical-candle/{instrument_key}/{interval}/{to_date}/{from_date}
    url = f"{UPSTOX_API_BASE}/historical-candle/{urllib.parse.quote(key, safe='')}/{interval}/{to_date}/{from_date}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "AI-CFO/1.0",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        raw_candles = (data.get("data") or {}).get("candles") or []
        candles: list[dict[str, Any]] = []
        # Upstox returns newest first; reverse to chronological order (oldest first)
        for c in reversed(raw_candles):
            if len(c) >= 5:
                candles.append({
                    "timestamp": c[0],
                    "date": str(c[0])[:10],
                    "open_paise": int(round(float(c[1]) * 100)),
                    "high_paise": int(round(float(c[2]) * 100)),
                    "low_paise": int(round(float(c[3]) * 100)),
                    "close_paise": int(round(float(c[4]) * 100)),
                    "volume": int(c[5]) if len(c) > 5 else 0,
                })
    except Exception as exc:
        logger.warning("Upstox historical candle fetch failed for %s: %s", key, exc)
        raise SecurityUpstreamError("Failed to fetch historical market data from provider") from exc

    return {
        "instrument_key": key,
        "period": period_norm,
        "candles": candles,
        "source": "UPSTOX",
        "as_of": now_iso,
    }
