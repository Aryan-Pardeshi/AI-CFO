"""Firecrawl request/content safety. Web text is always untrusted model input."""
import re
import secrets

_INJECTION = re.compile(r"(?:ignore\s+(?:all|previous)|system\s*[:：]|assistant\s*[:：]|tool[_ ]?call|function\s*call|reveal\s+(?:the\s+)?system|do\s+not\s+tell)", re.I)
_PRIVATE = re.compile(r"(?:net\s*worth|income|salary|account|portfolio\s+value|bank\s+balance|\b\d{8,}\b|₹\s*[\d,]+)", re.I)
_CONTROL = re.compile(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]")


def clean_web_content(text, max_chars=12000):
    text = str(text or "")
    warnings = []
    if _INJECTION.search(text) or re.search(r"!\[|<img\b|<!--|<tool_call>|\u200b|[\u202a-\u202e]", text, re.I):
        warnings.append("Suspicious instruction-like text was detected in the page")
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<img\b[^>]*>", "", text, flags=re.I)
    text = re.sub(r"</?tool_call\b[^>]*>", "", text, flags=re.I)
    text = _CONTROL.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars], warnings


def spotlight(text, url):
    nonce = secrets.token_hex(8)
    return f"<<untrusted_web_{nonce} url={url}>\n{text}\n<</untrusted_web_{nonce}>>"


class ResearchGuard:
    def __init__(self, max_searches=5, max_reads=8):
        self.max_searches, self.max_reads = max_searches, max_reads
        self.searches = 0
        self.reads = 0
        self.results = {}

    def validate_query(self, query):
        if not isinstance(query, str) or not query.strip() or len(query) > 300:
            raise ValueError("Invalid research query")
        if _PRIVATE.search(query):
            raise ValueError("Research queries cannot contain personal financial data")
        return query.strip()

    def record_search(self):
        if self.searches >= self.max_searches:
            raise RuntimeError("Firecrawl search limit reached")
        self.searches += 1

    def record_search_result(self, result_id, url):
        if not result_id or not isinstance(url, str) or not url.startswith(("https://", "http://")):
            raise ValueError("Invalid Firecrawl result")
        self.results[str(result_id)] = url

    def validate_read(self, result_id_or_url, user_urls=()):
        if self.reads >= self.max_reads:
            raise RuntimeError("Firecrawl read limit reached")
        value = str(result_id_or_url)
        allowed = self.results.get(value)
        if not allowed and value in set(user_urls):
            allowed = value
        if not allowed:
            raise ValueError("Page must be a user URL or this job's search result")
        self.reads += 1
        return allowed
