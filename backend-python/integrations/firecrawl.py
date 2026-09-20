"""Cited, bounded Firecrawl search/scrape adapter."""
from datetime import datetime, timezone
import json
import os

from agent.research_safety import ResearchGuard, clean_web_content, spotlight


class FirecrawlError(RuntimeError):
    pass


class FirecrawlClient:
    BASE_URL = "https://api.firecrawl.dev/v2"

    def __init__(self, http, api_key, guard=None, base_url=None):
        if not api_key:
            api_key = os.environ.get("FIRECRAWL_API_KEY") or _secret_token()
        if not api_key:
            raise FirecrawlError("Firecrawl credentials are not configured")
        self.http = http
        self.api_key = api_key
        self.guard = guard or ResearchGuard()
        self.base_url = (base_url or self.BASE_URL).rstrip("/")

    def _post(self, path, payload):
        try:
            response = self.http.post(f"{self.base_url}/{path.lstrip('/')}", json=payload,
                                      headers={"Authorization": f"Bearer {self.api_key}"}, timeout=15)
            if getattr(response, "status_code", 200) >= 400:
                raise FirecrawlError("Firecrawl returned an upstream error")
            result = response.json()
        except FirecrawlError:
            raise
        except Exception as exc:
            raise FirecrawlError("Firecrawl is unavailable right now") from exc
        if not isinstance(result, dict) or result.get("success") is False:
            raise FirecrawlError("Firecrawl returned invalid research data")
        return result

    def search(self, query, source="web", recency=None, country="IN"):
        query = self.guard.validate_query(query)
        if source not in {"web", "news"}:
            raise ValueError("source must be web or news")
        self.guard.record_search()
        payload = {"query": query, "limit": 10, "sources": [source], "country": country}
        if recency:
            payload["tbs"] = recency
        result = self._post("search", payload)
        rows = result.get("data") or result.get("results") or []
        out = []
        for index, row in enumerate(rows):
            if not isinstance(row, dict) or not row.get("url"):
                continue
            result_id = str(row.get("id") or f"search-{index}")
            self.guard.record_search_result(result_id, row["url"])
            out.append({"result_id": result_id, "title": row.get("title", ""), "url": row["url"],
                        "snippet": row.get("description") or row.get("snippet", "")})
        as_of = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return {"source": "Firecrawl", "as_of": as_of, "warnings": [], "data": out}

    def read(self, result_id_or_url, user_urls=()):
        url = self.guard.validate_read(result_id_or_url, user_urls)
        result = self._post("scrape", {"url": url, "formats": ["markdown"], "onlyMainContent": True,
                                        "blockAds": True, "removeBase64Images": True, "timeout": 15000})
        data = result.get("data") or result
        raw = data.get("markdown") if isinstance(data, dict) else ""
        cleaned, warnings = clean_web_content(raw)
        as_of = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return {"source": "Firecrawl", "as_of": as_of, "warnings": warnings,
                "data": {"url": url, "content": spotlight(cleaned, url)}}


def _secret_token():
    try:
        import boto3
        value = boto3.client("secretsmanager").get_secret_value(SecretId="aicfo/firecrawl").get("SecretString", "{}")
        return json.loads(value).get("api_key")
    except Exception:
        return None
