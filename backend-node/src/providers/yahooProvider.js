"use strict";

const DEFAULT_TIMEOUT_MS = 7000;
const RANGE_TO_YAHOO = {
  "1W": { range: "5d", interval: "1d" },
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  ALL: { range: "max", interval: "1mo" },
};

class YahooUpstreamError extends Error {
  constructor(message) {
    super(message);
    this.name = "YahooUpstreamError";
  }
}

// The only index symbols we chart against. They start with "^", which the
// general ticker pattern below deliberately refuses, so they are allowlisted.
const BENCHMARK_SYMBOLS = new Set(["^NSEI", "^BSESN", "^GSPC", "^IXIC"]);

function safeTicker(value) {
  return typeof value === "string" && (BENCHMARK_SYMBOLS.has(value) || /^[A-Z0-9][A-Z0-9._^=-]{0,19}$/.test(value));
}

function uniqueTickers(tickers) {
  return [...new Set((Array.isArray(tickers) ? tickers : []).map((ticker) => String(ticker).toUpperCase()).filter(safeTicker))].slice(0, 20);
}

function toFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isHttpsUrl(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function createYahooProvider(fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (typeof fetchImpl !== "function") throw new TypeError("Yahoo provider requires fetch");

  async function request(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response || !response.ok) throw new YahooUpstreamError(`Yahoo returned ${response && response.status}`);
      const body = await response.json();
      if (!body || typeof body !== "object") throw new YahooUpstreamError("Yahoo returned invalid JSON");
      return body;
    } catch (error) {
      if (error instanceof YahooUpstreamError) throw error;
      throw new YahooUpstreamError("Yahoo request failed");
    } finally {
      clearTimeout(timer);
    }
  }

  async function getOneQuote(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`;
    const body = await request(url);
    const chart = body.chart && Array.isArray(body.chart.result) ? body.chart.result[0] : null;
    const meta = chart && chart.meta;
    const closes = chart && (chart.indicators?.adjclose?.[0]?.adjclose || chart.indicators?.quote?.[0]?.close);
    const validCloses = Array.isArray(closes) ? closes.filter((close) => toFiniteNumber(close) !== null) : [];
    const price = meta?.regularMarketPrice ?? validCloses.at(-1);
    const previous = meta?.chartPreviousClose ?? meta?.previousClose ?? validCloses.at(-2);
    const directChange = meta && meta.regularMarketChangePercent;
    const changePercent = toFiniteNumber(directChange) !== null
      ? toFiniteNumber(directChange)
      : (toFiniteNumber(price) !== null && toFiniteNumber(previous) !== null && previous > 0 ? Number((((price - previous) / previous) * 100).toFixed(4)) : null);
    const result = {
      price: toFiniteNumber(price),
      changePercent,
    };
    if (meta && typeof meta.currency === "string" && meta.currency.trim() !== "") result.currency = meta.currency;
    const name = meta && (typeof meta.longName === "string" && meta.longName.trim() !== "" ? meta.longName : meta.shortName);
    if (typeof name === "string" && name.trim() !== "") result.name = name.trim();
    return result;
  }

  async function getQuoteDetails(tickers) {
    const result = {};
    const safe = uniqueTickers(tickers);
    const responses = await Promise.allSettled(safe.map(async (ticker) => [ticker, await getOneQuote(ticker)]));
    for (const response of responses) {
      if (response.status === "fulfilled" && response.value[1].price !== null) result[response.value[0]] = response.value[1];
    }
    return result;
  }

  async function getQuotes(tickers) {
    const details = await getQuoteDetails(tickers);
    return Object.fromEntries(Object.entries(details).map(([ticker, quote]) => [ticker, quote.price]));
  }

  async function getOneNews(ticker) {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=10`;
    const body = await request(url);
    const news = Array.isArray(body.news) ? body.news : [];
    return news.map((item) => ({
      id: typeof item.uuid === "string" ? item.uuid : null,
      ticker,
      title: typeof item.title === "string" ? item.title : null,
      publisher: typeof item.publisher === "string" ? item.publisher : null,
      link: typeof item.link === "string" ? item.link : null,
      publishedAt: Number.isFinite(item.providerPublishTime) ? new Date(item.providerPublishTime * 1000).toISOString() : null,
      summary: typeof item.summary === "string" ? item.summary : "",
      thumbnail: item.thumbnail && typeof item.thumbnail.resolutions?.[0]?.url === "string" ? item.thumbnail.resolutions[0].url : null,
    })).filter((item) => item.title && item.publisher && item.link && item.publishedAt && isHttpsUrl(item.link));
  }

  async function getNews(tickers) {
    const safe = uniqueTickers(tickers);
    const responses = await Promise.allSettled(safe.map((ticker) => getOneNews(ticker)));
    if (safe.length > 0 && responses.length > 0 && responses.every((response) => response.status === "rejected")) {
      throw new YahooUpstreamError("Yahoo request failed");
    }
    return responses.flatMap((response) => response.status === "fulfilled" ? response.value : []);
  }

  async function getOneHistorical(ticker, range) {
    const period = RANGE_TO_YAHOO[range];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${period.range}&interval=${period.interval}&events=div%2Csplits`;
    const body = await request(url);
    const result = body.chart && Array.isArray(body.chart.result) ? body.chart.result[0] : null;
    const timestamps = result && Array.isArray(result.timestamp) ? result.timestamp : [];
    const quote = result && result.indicators && result.indicators.adjclose?.[0]?.adjclose;
    const regular = result && result.indicators && result.indicators.quote?.[0]?.close;
    const closes = Array.isArray(quote) ? quote : regular;
    if (!Array.isArray(closes)) return [];
    return timestamps.map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      close: toFiniteNumber(closes[index]),
    })).filter((point) => point.close !== null);
  }

  async function getHistorical(tickers, range) {
    const safe = uniqueTickers(tickers);
    const responses = await Promise.allSettled(safe.map(async (ticker) => [ticker, await getOneHistorical(ticker, range)]));
    const result = {};
    for (const response of responses) {
      if (response.status === "fulfilled" && response.value[1].length > 0) result[response.value[0]] = response.value[1];
    }
    return result;
  }

  return { getQuotes, getQuoteDetails, getNews, getHistorical };
}

module.exports = { createYahooProvider, YahooUpstreamError, RANGE_TO_YAHOO, safeTicker, uniqueTickers };
