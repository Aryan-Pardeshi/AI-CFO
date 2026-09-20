"""mfapi.in mutual-fund scheme/NAV adapter."""
from datetime import datetime


class MfapiError(RuntimeError):
    pass


class MfapiClient:
    BASE_URL = "https://api.mfapi.in/mf"

    def __init__(self, http=None, scheme_catalog=None, base_url=None):
        if http is None:
            import requests
            http = requests
        self.http = http
        self.scheme_catalog = scheme_catalog
        self.base_url = (base_url or self.BASE_URL).rstrip("/")

    def search_schemes(self, query, limit=10):
        if not isinstance(query, str) or len(query.strip()) < 2:
            raise ValueError("query must contain at least two characters")
        catalog = self.scheme_catalog or []
        needle = " ".join(query.casefold().split())
        rows = []
        for item in catalog:
            name = str(item.get("schemeName") or item.get("scheme_name") or "")
            if needle in " ".join(name.casefold().split()):
                rows.append({"scheme_code": str(item.get("schemeCode") or item.get("scheme_code")), "scheme_name": name})
        return {"source": "mfapi.in", "as_of": datetime.utcnow().date().isoformat(), "warnings": [], "data": rows[:max(1, min(int(limit), 10))]}

    def latest_nav(self, scheme_code):
        if not str(scheme_code).strip():
            raise ValueError("scheme_code is required")
        try:
            response = self.http.get(f"{self.base_url}/{scheme_code}", timeout=10)
            if getattr(response, "status_code", 200) >= 400:
                raise MfapiError("mfapi.in returned an upstream error")
            payload = response.json()
        except MfapiError:
            raise
        except Exception as exc:
            raise MfapiError("mfapi.in is unavailable right now") from exc
        rows = payload.get("data") if isinstance(payload, dict) else None
        if not rows or not isinstance(rows[0], dict) or rows[0].get("nav") is None:
            raise MfapiError("mfapi.in returned no NAV")
        raw_date = rows[0].get("date")
        try:
            as_of = datetime.strptime(raw_date, "%d-%m-%Y").date().isoformat()
        except (TypeError, ValueError):
            as_of = str(raw_date)
        return {"source": "mfapi.in", "as_of": as_of, "warnings": [],
                "data": {"scheme_code": str(scheme_code), "nav_inr": float(rows[0]["nav"])}}
