from integrations.firecrawl import FirecrawlClient


class Response:
    status_code = 200

    def __init__(self, payload):
        self.payload = payload

    def json(self):
        return self.payload


class Http:
    def __init__(self):
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if url.endswith("/search"):
            return Response({"data": [{"id": "r1", "title": "RBI", "url": "https://rbi.org.in/rules"}]})
        return Response({"data": {"markdown": "RBI guidance"}})


def test_search_and_read_return_dated_explicit_citations():
    client = FirecrawlClient(Http(), "token")
    search = client.search("latest RBI inflation guidance")
    assert search["citations"][0]["id"] == "r1"
    assert search["citations"][0]["source"] == "Firecrawl"
    assert search["citations"][0]["as_of"] == search["as_of"]
    read = client.read("r1")
    assert read["citations"][0]["id"] == "r1"
    assert read["citations"][0]["as_of"] == read["as_of"]
    assert read["data"]["content"].startswith("<<untrusted_web_")
