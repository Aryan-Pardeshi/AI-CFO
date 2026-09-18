"use strict";

const crypto = require("node:crypto");

class GoogleNewsUpstreamError extends Error {
  constructor(message) {
    super(message);
    this.name = "GoogleNewsUpstreamError";
  }
}

// Built from a char code so this file never contains a raw entity literal that
// tooling could rewrite on the way in.
const AMP = String.fromCharCode(38);
const ENTITY = new RegExp(AMP + "(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|quot|apos|amp);", "g");
const NAMED_ENTITIES = { lt: "<", gt: ">", quot: '"', apos: "'", amp: AMP };

// One pass over the text, so an escaped entity is never decoded twice.
function decodeXmlEntities(text) {
  if (typeof text !== "string") return text;
  return text.replace(ENTITY, (match, body) => {
    if (body[0] !== "#") return NAMED_ENTITIES[body];
    const code = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      return match;
    }
  });
}

// CDATA content is literal by definition: only the text around it is entity-decoded.
function xmlText(raw) {
  if (typeof raw !== "string") return raw;
  let out = "";
  let last = 0;
  for (const cdata of raw.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
    out += decodeXmlEntities(raw.slice(last, cdata.index)) + cdata[1];
    last = cdata.index + cdata[0].length;
  }
  return out + decodeXmlEntities(raw.slice(last));
}

function extractTagContent(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function extractSource(xml) {
  const regex = /<source[^>]*>([\s\S]*?)<\/source>/i;
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractItems(rssText) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(rssText)) !== null) {
    items.push(match[1]);
  }
  return items;
}

function isHttpsUrl(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function sha1Hex16(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}

// Price / quote landing pages that search engines file under "news". Patterns are
// deliberately narrow so a real headline that mentions a share price survives.
const QUOTE_PAGE_TITLES = [
  /\bshare\/stock price\b/i,
  /\bprice (?:and|\u0026) chart\b/i,
  /\blive (?:nse|bse)\b/i,
  /\bshareholding pattern\b/i,
  /\bkey financial ratios\b/i,
  /\bshare price today\b.*\bstock analysis\b/i,
];

const DAY_MS = 24 * 60 * 60 * 1000;

function createGoogleNewsProvider(fetchImpl = globalThis.fetch, timeoutMs = 5000, { now = () => Date.now(), maxAgeDays = 45 } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Google News provider requires fetch");

  async function fetchOne(queryObj) {
    const { ticker, query } = queryObj;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response || !response.ok) throw new GoogleNewsUpstreamError(`Google News returned ${response && response.status}`);
      const text = await response.text();
      return { ticker, rss: text };
    } catch (error) {
      if (error instanceof GoogleNewsUpstreamError) throw error;
      throw new GoogleNewsUpstreamError("Google News request failed");
    } finally {
      clearTimeout(timer);
    }
  }

  function parseRss(rssText, ticker) {
    const items = extractItems(rssText);
    const results = [];
    for (const itemXml of items) {
      const titleRaw = extractTagContent(itemXml, "title");
      const linkRaw = extractTagContent(itemXml, "link");
      const pubDateRaw = extractTagContent(itemXml, "pubDate");
      const sourceRaw = extractSource(itemXml);

      if (!titleRaw || !linkRaw || !pubDateRaw || !sourceRaw) continue;

      const title = xmlText(titleRaw).trim();
      const link = xmlText(linkRaw).trim();
      const pubDate = xmlText(pubDateRaw).trim();
      const publisher = xmlText(sourceRaw).trim();

      if (!isHttpsUrl(link)) continue;

      let cleanTitle = title;
      const suffix = ` - ${publisher}`;
      if (title.endsWith(suffix)) {
        cleanTitle = title.slice(0, -suffix.length);
      }

      let publishedAt;
      try {
        publishedAt = new Date(pubDate).toISOString();
      } catch {
        continue;
      }

      const age = now() - Date.parse(publishedAt);
      if (age > maxAgeDays * DAY_MS || age < 0) continue;
      if (QUOTE_PAGE_TITLES.some((pattern) => pattern.test(cleanTitle))) continue;

      const id = sha1Hex16(link);

      results.push({
        id,
        ticker,
        title: cleanTitle,
        publisher,
        link,
        publishedAt,
        summary: "",
        thumbnail: null,
      });

      if (results.length >= 6) break;
    }
    return results;
  }

  async function getNews(queries) {
    if (!Array.isArray(queries) || queries.length === 0) return [];

    const limitedQueries = queries.slice(0, 20);
    const responses = await Promise.allSettled(limitedQueries.map(fetchOne));

    let allItems = [];
    let hasSuccess = false;

    for (const response of responses) {
      if (response.status === "fulfilled") {
        hasSuccess = true;
        const { ticker, rss } = response.value;
        const items = parseRss(rss, ticker);
        allItems.push(...items);
      }
    }

    if (limitedQueries.length > 0 && !hasSuccess) {
      throw new GoogleNewsUpstreamError("All Google News queries failed");
    }

    return allItems;
  }

  return { getNews, GoogleNewsUpstreamError };
}

module.exports = { createGoogleNewsProvider, GoogleNewsUpstreamError };