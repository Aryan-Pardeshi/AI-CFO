import pytest

from integrations.upstox import MarketDataError, UpstoxClient


class FakeResponse:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status_code = status

    def json(self):
        return self.payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError("upstream")


class FakeHttp:
    def __init__(self, payload, status=200):
        self.payload, self.status = payload, status
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return FakeResponse(self.payload, self.status)


def test_quote_preserves_source_and_as_of_without_inventing_values():
    http = FakeHttp({"data": {"NSE_EQ|INE": {"last_price": 125.5, "timestamp": "2026-09-20T10:00:00Z"}}})
    client = UpstoxClient(http=http, token="token")
    result = client.quote("NSE_EQ|INE")
    assert result["source"] == "Upstox"
    assert result["as_of"] == "2026-09-20T10:00:00Z"
    assert result["data"]["last_price_inr"] == 125.5


def test_history_normalizes_candles_and_rejects_missing_data():
    http = FakeHttp({"data": {"candles": [["2026-09-19T00:00:00Z", 1, 2, 0.5, 1.5, 10, 0]]}})
    result = UpstoxClient(http=http, token="token").history("NSE_EQ|INE", "2026-09-19", "2026-09-20")
    assert result["source"] == "Upstox"
    assert result["data"]["candles"][0]["close_inr"] == 1.5
    assert result["as_of"] == "2026-09-19T00:00:00Z"


def test_upstream_and_invalid_responses_are_honest_errors():
    with pytest.raises(ValueError):
        UpstoxClient(http=FakeHttp({}), token="token").quote("")
    with pytest.raises(MarketDataError):
        UpstoxClient(http=FakeHttp({}, 503), token="token").quote("NSE_EQ|INE")
    with pytest.raises(MarketDataError):
        UpstoxClient(http=FakeHttp({"data": {}}), token="token").quote("NSE_EQ|INE")


def test_daily_cache_avoids_second_quote_request():
    http = FakeHttp({"data": {"NSE_EQ|INE": {"last_price": 10, "timestamp": "2026-09-20T10:00:00Z"}}})
    cache = {}
    client = UpstoxClient(http=http, token="token", cache=cache)
    client.quote("NSE_EQ|INE", as_of="2026-09-20")
    client.quote("NSE_EQ|INE", as_of="2026-09-20")
    assert len(http.calls) == 1


def test_risk_requests_and_uses_requested_period_only():
    candles = [["2020-01-01T00:00:00Z", 1, 1, 1, 1, 1, 0],
               ["2025-01-01T00:00:00Z", 1, 1, 1, 2, 1, 0],
               ["2026-01-01T00:00:00Z", 2, 2, 2, 4, 1, 0],
               ["2026-09-19T00:00:00Z", 4, 4, 4, 8, 1, 0]]
    http = FakeHttp({"data": {"candles": candles}})
    result = UpstoxClient(http=http, token="token").risk_metrics("NSE_EQ|INE", "1y")
    url, _ = http.calls[0]
    assert url.endswith("/2025-09-20")
    assert result["data"]["observations"] == 1


def test_search_reports_unavailable_without_verified_catalog():
    with pytest.raises(MarketDataError, match="catalog"):
        UpstoxClient(http=FakeHttp({}), token="token").search("nifty")
