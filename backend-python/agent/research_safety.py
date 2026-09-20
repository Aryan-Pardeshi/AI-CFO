"""Firecrawl request/content safety. Web text is always untrusted model input."""
import re
import secrets
from urllib.parse import urlsplit, urlunsplit

_INJECTION = re.compile(
    r"(?:ignore\s+(?:all|previous)|forget\s+(?:the\s+)?(?:earlier|previous|all|your)"
    r"|system\s*[:：]|assistant\s*[:：]|system\s+prompt|you\s+are\s+now"
    r"|tool[_ ]?call|function\s*call|reveal\s+(?:the\s+)?system|do\s+not\s+tell"
    r"|<\|?\s*/?\s*(?:im_start|im_end|system|assistant|inst)\b"
    # Our own tool names inside page text are an instruction, never content.
    r"|\b(?:propose_[a-z_]+|read_web_page|web_search|calculate_fire|get_financial_snapshot"
    r"|get_net_worth|get_portfolio_analysis|get_holdings|get_profile|get_loans|get_goals)\b)",
    re.I,
)
_PRIVATE = re.compile(r"(?:net\s*worth|income|salary|account|portfolio\s+value|bank\s+balance|\b\d{8,}\b|₹\s*[\d,]+)", re.I)
_CONTROL = re.compile(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]")
# Markup that can only serve remote loading, hidden text, or fake tool traffic.
_MARKUP_TRIPWIRE = re.compile(r"!\[|<img\b|<!--|<tool_call>|<script\b|<iframe\b", re.I)
# A link or image target whose query parameters name personal financial data is an
# exfiltration channel (EchoLeak-style), not a reference.
_EXFIL_TARGET = re.compile(
    r"(?:\]\(|src\s*=\s*[\"']?|href\s*=\s*[\"']?)[^)\s\"'>]*[?&]"
    r"(?:net_?worth|income|salary|balance|account\w*|portfolio\w*|email|phone|mobile"
    r"|token|secret|password|api_?key|user_?id|sub)\s*=",
    re.I,
)


def clean_web_content(text, max_chars=12000):
    text = str(text or "")
    warnings = []
    hostile = bool(
        _INJECTION.search(text)
        or _MARKUP_TRIPWIRE.search(text)
        or _CONTROL.search(text)
        or _EXFIL_TARGET.search(text)
    )
    if hostile:
        warnings.append("Suspicious instruction-like text was detected in the page")
        # Never expose a partially cleaned hostile page to the model. The
        # caller may retain the warning, but the content is quarantined.
        return "", warnings
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<img\b[^>]*>", "", text, flags=re.I)
    text = re.sub(r"</?tool_call\b[^>]*>", "", text, flags=re.I)
    text = _CONTROL.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars], warnings


def spotlight(text, url):
    url = normalize_url(url)
    nonce = secrets.token_hex(8)
    return f"<<untrusted_web_{nonce} url={url}>\n{text}\n<</untrusted_web_{nonce}>>"


def normalize_url(value):
    if not isinstance(value, str) or not value or any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("Invalid URL")
    if _CONTROL.search(value):
        # Zero-width, bidi, and BOM characters hide the real destination.
        raise ValueError("Invalid URL")
    try:
        parts = urlsplit(value)
        if parts.scheme.casefold() not in {"http", "https"} or not parts.netloc:
            raise ValueError("Invalid URL")
        if parts.username or parts.password or not parts.hostname:
            raise ValueError("Invalid URL")
        port = parts.port
        if port is not None and not 1 <= port <= 65535:
            raise ValueError("Invalid URL")
        host = parts.hostname.casefold()
        netloc = host
        if port is not None:
            netloc += f":{port}"
        normalized = urlunsplit((parts.scheme.casefold(), netloc, parts.path or "/", parts.query, parts.fragment))
        if any(ord(char) < 32 or ord(char) == 127 for char in normalized):
            raise ValueError("Invalid URL")
        return normalized
    except (TypeError, ValueError):
        raise ValueError("Invalid URL")


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
        if not result_id:
            raise ValueError("Invalid Firecrawl result")
        self.results[str(result_id)] = normalize_url(url)

    def validate_read(self, result_id_or_url, user_urls=()):
        if self.reads >= self.max_reads:
            raise RuntimeError("Firecrawl read limit reached")
        value = str(result_id_or_url)
        allowed = self.results.get(value)
        if not allowed:
            normalized_user_urls = {normalize_url(item) for item in user_urls}
            try:
                normalized_value = normalize_url(value)
            except ValueError:
                normalized_value = None
            if normalized_value in normalized_user_urls:
                allowed = normalized_value
        if not allowed:
            raise ValueError("Page must be a user URL or this job's search result")
        self.reads += 1
        return allowed
