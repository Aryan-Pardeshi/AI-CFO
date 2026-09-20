import pytest
from datetime import datetime, timezone

from integrations.mfapi import MfapiClient, MfapiError


class Response:
    def __init__(self, payload, status=200):
        self.payload, self.status_code = payload, status

    def json(self):
        return self.payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError("upstream")


class Http:
    def __init__(self, payload, status=200):
        self.payload, self.status, self.calls = payload, status, []

    def get(self, url, **kwargs):
        self.calls.append(url)
        return Response(self.payload, self.status)


def test_search_normalizes_identifiers_without_per_keystroke_http_calls():
    http = Http({"schemes": [{"schemeCode": "123", "schemeName": "Acme Nifty 50 Index Direct Growth"}]})
    client = MfapiClient(http=http, scheme_catalog=http.payload["schemes"])
    result = client.search_schemes(" nifty 50 ")
    assert result["source"] == "mfapi.in"
    assert result["data"][0]["scheme_code"] == "123"
    assert http.calls == []


def test_nav_preserves_scheme_and_date():
    http = Http({"meta": {"scheme_code": 123}, "data": [{"date": "20-09-2026", "nav": "101.25"}]})
    result = MfapiClient(http=http).latest_nav("123")
    assert result["source"] == "mfapi.in"
    assert result["data"]["nav_inr"] == 101.25
    assert result["as_of"] == "2026-09-20"


def test_bad_scheme_or_upstream_failure_is_not_fabricated():
    with pytest.raises(ValueError):
        MfapiClient(http=Http({})).latest_nav("")
    with pytest.raises(MfapiError):
        MfapiClient(http=Http({}, 500)).latest_nav("123")


def test_search_as_of_uses_timezone_aware_today():
    result = MfapiClient(http=Http({}), scheme_catalog=[]).search_schemes("index")
    assert result["as_of"] == datetime.now(timezone.utc).date().isoformat()
