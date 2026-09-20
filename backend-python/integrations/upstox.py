"""Read-only Upstox market adapter with injected transport and optional daily cache."""
from datetime import datetime, timedelta, timezone
import os
import json


class MarketDataError(RuntimeError):
    pass


def _as_of(value=None):
    return value or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class UpstoxClient:
    BASE_URL = "https://api.upstox.com"

    def __init__(self, http=None, token=None, cache=None, base_url=None, instruments=None, portfolio=None):
        self.http = http or _default_http()
        self.token = token or os.environ.get("UPSTOX_ANALYTICS_TOKEN") or _secret_token("aicfo/upstox", "analytics_token")
        self.cache = cache
        self.base_url = (base_url or self.BASE_URL).rstrip("/")
        self.instruments = instruments
        self.portfolio = portfolio or []
        if not self.token:
            raise MarketDataError("Upstox credentials are not configured")

    def _get(self, path, params):
        try:
            response = self.http.get(
                f"{self.base_url}/{path.lstrip('/')}",
                params=params,
                headers={"Authorization": f"Bearer {self.token}", "Accept": "application/json"},
                timeout=10,
            )
            if getattr(response, "status_code", 200) >= 400:
                raise MarketDataError("Upstox returned an upstream error")
            payload = response.json()
        except MarketDataError:
            raise
        except Exception as exc:
            raise MarketDataError("Upstox is unavailable right now") from exc
        if not isinstance(payload, dict) or payload.get("status") == "error":
            raise MarketDataError("Upstox returned invalid market data")
        return payload

    def quote(self, instrument_key, as_of=None):
        if not instrument_key:
            raise ValueError("instrument_key is required")
        cache_key = f"quote:{instrument_key}:{as_of or datetime.now(timezone.utc).date().isoformat()}"
        if self.cache is not None and cache_key in self.cache:
            return self.cache[cache_key]
        payload = self._get("v2/market-quote/quotes", {"instrument_key": instrument_key})
        row = (payload.get("data") or {}).get(instrument_key)
        if not isinstance(row, dict) or row.get("last_price") is None:
            raise MarketDataError("Upstox returned no quote for this instrument")
        observed = row.get("timestamp") or (row.get("data") or {}).get("timestamp")
        result = {"source": "Upstox", "as_of": _as_of(observed or as_of), "warnings": [],
                  "data": {"instrument_key": instrument_key,
                           "last_price_inr": float(row["last_price"]),
                           "prev_close_inr": row.get("prev_close_price")}}
        if self.cache is not None:
            self.cache[cache_key] = result
        return result

    def history(self, instrument_key, from_date, to_date, unit="days", interval="1"):
        if not instrument_key or not from_date or not to_date:
            raise ValueError("instrument_key, from_date, and to_date are required")
        payload = self._get(f"v3/historical-candle/{instrument_key}/{unit}/{interval}/{to_date}/{from_date}", {})
        candles = (payload.get("data") or {}).get("candles")
        if not isinstance(candles, list) or not candles:
            raise MarketDataError("Upstox returned no historical candles")
        normalized = []
        for candle in candles:
            if not isinstance(candle, list) or len(candle) < 6:
                continue
            normalized.append({"timestamp": candle[0], "open_inr": candle[1], "high_inr": candle[2],
                               "low_inr": candle[3], "close_inr": candle[4], "volume": candle[5]})
        if not normalized:
            raise MarketDataError("Upstox returned invalid historical candles")
        return {"source": "Upstox", "as_of": normalized[0]["timestamp"], "warnings": [],
                "data": {"instrument_key": instrument_key, "candles": normalized}}

    def fundamentals(self, isin):
        if not isin:
            raise ValueError("isin is required")
        payload = self._get("v2/fundamental/profile", {"isin": isin})
        return {"source": "Upstox", "as_of": _as_of(), "warnings": [], "data": payload.get("data", {})}

    def search(self, query, asset_type=None, limit=10):
        needle = " ".join(str(query or "").casefold().split())
        if len(needle) < 2:
            raise ValueError("query must contain at least two characters")
        if not self.instruments:
            raise MarketDataError("Upstox instrument catalog is unavailable")
        rows = []
        for item in self.instruments:
            name = str(item.get("name") or item.get("trading_symbol") or "")
            kind = str(item.get("asset_type") or "").upper()
            if needle in name.casefold() and (not asset_type or kind == asset_type.upper()):
                rows.append({"instrument_key": item.get("instrument_key"), "name": name, "asset_type": kind})
        return {"source": "Upstox", "as_of": _as_of(), "warnings": [], "data": rows[:max(1, min(int(limit), 10))]}

    def overview(self, instrument_key):
        quote = self.quote(instrument_key)
        return {"source": quote["source"], "as_of": quote["as_of"], "warnings": quote["warnings"], "data": quote["data"]}

    def risk_metrics(self, instrument_key, period="1y"):
        if period not in {"1y", "3y", "5y"}:
            raise ValueError("period must be 1y, 3y, or 5y")
        today = datetime.now(timezone.utc).date()
        years = int(period[:-1])
        start_date = today - timedelta(days=365 * years)
        history = self.history(instrument_key, start_date.isoformat(), today.isoformat())
        candles = []
        for candle in history["data"]["candles"]:
            try:
                if start_date <= datetime.fromisoformat(str(candle["timestamp"]).replace("Z", "+00:00")).date() <= today:
                    candles.append(candle)
            except (TypeError, ValueError):
                continue
        closes = [float(c["close_inr"]) for c in candles if c.get("close_inr") is not None]
        if len(closes) < 2:
            raise MarketDataError("Not enough history for risk metrics")
        returns = [(closes[i] / closes[i - 1]) - 1 for i in range(1, len(closes))]
        mean = sum(returns) / len(returns)
        variance = sum((r - mean) ** 2 for r in returns) / len(returns)
        return {"source": history["source"], "as_of": history["as_of"], "warnings": [],
                "data": {"period": period, "observations": len(returns), "average_return": mean,
                         "volatility": variance ** 0.5}}

    def portfolio_fit(self, instrument_key, add_amount_inr=0):
        quote = self.quote(instrument_key)
        total = sum(float(x.get("value_inr") or 0) for x in self.portfolio)
        after = total + float(add_amount_inr)
        return {"source": quote["source"], "as_of": quote["as_of"], "warnings": [],
                "data": {"instrument_key": instrument_key, "add_amount_inr": float(add_amount_inr),
                         "portfolio_value_inr": total, "portfolio_value_after_inr": after,
                         "method": "deterministic current-value comparison"}}

    def news(self, instrument_key):
        if not instrument_key:
            raise ValueError("instrument_key is required")
        payload = self._get("market-news", {"instrument_key": instrument_key})
        return {"source": "Upstox", "as_of": _as_of(), "warnings": [], "data": payload.get("data", [])}


def _default_http():
    import requests
    return requests


def _secret_token(secret_id, field):
    try:
        import boto3
        value = boto3.client("secretsmanager").get_secret_value(SecretId=secret_id).get("SecretString", "{}")
        return json.loads(value).get(field)
    except Exception:
        return None
