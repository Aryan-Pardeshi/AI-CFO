"use strict";

const portfolioModel = require("../models/portfolioModel");
const { createYahooProvider, safeTicker } = require("../providers/yahooProvider");
const { createGoogleNewsProvider } = require("../providers/googleNewsProvider");
const { createNewsProvider } = require("../providers/newsProvider");
const { buildRationale, summarizeHoldings } = require("./rationale");

let yahooProvider = createYahooProvider();
let googleNewsProvider = createGoogleNewsProvider();
let newsProvider = createNewsProvider({ yahoo: yahooProvider, google: googleNewsProvider });
const MAX_TICKERS = 20;
const RANGES = new Set(["1W", "1M", "3M", "6M", "1Y", "ALL"]);

class ValidationServiceError extends Error {
  constructor(details) {
    super("Request validation failed");
    this.code = "VALIDATION_ERROR";
    this.details = details;
  }
}

class UpstreamServiceError extends Error {
  constructor(message = "Yahoo Finance upstream unavailable") {
    super(message);
    this.code = "UPSTREAM_UNAVAILABLE";
  }
}

function createFakeGoogleNewsProvider() {
  return {
    getNews: async () => [],
  };
}

function setYahooProvider(provider, googleProvider = createFakeGoogleNewsProvider()) {
  yahooProvider = provider;
  googleNewsProvider = googleProvider;
  newsProvider = createNewsProvider({ yahoo: yahooProvider, google: googleNewsProvider });
}

function resetYahooProvider() {
  yahooProvider = createYahooProvider();
  googleNewsProvider = createGoogleNewsProvider();
  newsProvider = createNewsProvider({ yahoo: yahooProvider, google: googleNewsProvider });
}

function normalizeTicker(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function parseTickers(raw, field = "tickers") {
  if (raw === undefined || raw === null || raw === "") return [];
  const values = Array.isArray(raw) ? raw : String(raw).split(",");
  if (values.length > MAX_TICKERS) throw new ValidationServiceError({ [field]: "must contain at most 20 tickers" });
  const tickers = [...new Set(values.map(normalizeTicker))];
  if (tickers.some((ticker) => !safeTicker(ticker))) {
    throw new ValidationServiceError({ [field]: "contains an unsafe ticker" });
  }
  return tickers;
}

function heldTickers(context) {
  return context.symbols.filter((ticker) => /^[A-Z0-9][A-Z0-9._^=-]{0,19}$/.test(ticker)).slice(0, MAX_TICKERS);
}

function marketProvenance() {
  return { source: "Yahoo Finance", as_of: new Date().toISOString() };
}

function isHttpsLink(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function baseTicker(ticker) {
  return ticker.toUpperCase().replace(/\.NS$|\.BO$/, "");
}

function selectedPreferences(snapshot) {
  const preferences = snapshot && snapshot.preferences && typeof snapshot.preferences === "object" ? snapshot.preferences : {};
  return {
    industries: Array.isArray(preferences.industries) ? preferences.industries.map(String) : [],
    instruments: Array.isArray(preferences.instruments) ? preferences.instruments.map(String) : [],
  };
}

function preferenceKey(value) {
  return String(value).toLowerCase().replace(/&/g, " and ").replace(/[()]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const INDUSTRY_ALIASES = {
  IT: new Set(["it", "technology", "software", "technology and software", "information technology"]),
  RENEWABLE_EV: new Set(["renewable energy and ev", "renewables", "electric vehicles"]),
  BANKING: new Set(["banking", "banking and fintech", "financials", "finance"]),
  HEALTHCARE: new Set(["healthcare and pharma", "healthcare", "pharma"]),
  FMCG: new Set(["fmcg and consumer brands", "fmcg", "consumer brands"]),
  REAL_ESTATE: new Set(["real estate and infrastructure", "real estate", "infrastructure"]),
  AUTOMOBILES: new Set(["automobiles and manufacturing", "automobiles", "manufacturing"]),
  DEFENCE: new Set(["defence and aerospace", "defense and aerospace", "defence", "defense"]),
  AI_SEMI: new Set(["artificial intelligence and semi", "artificial intelligence", "semiconductors", "semi"]),
  INDEX: new Set(["index", "index and mutual funds", "broad market"]),
  GOLD: new Set(["gold", "precious metals"]),
  ENERGY: new Set(["energy", "oil and gas"]),
};
const INSTRUMENT_ALIASES = {
  STOCK: new Set(["stock", "stocks", "equity", "equities", "equities direct stocks", "direct stocks"]),
  ETF: new Set(["etf", "etfs", "exchange traded funds etfs", "index and mutual funds", "mutual funds"]),
  INDEX_MUTUAL_FUND: new Set(["index and mutual funds", "mutual funds", "index"]),
  BONDS: new Set(["bonds and fixed income", "bonds", "fixed income"]),
  GOLD: new Set(["gold and precious metals", "gold", "precious metals"]),
  REIT: new Set(["real estate reits", "reits", "real estate"]),
  CRYPTO: new Set(["crypto and web3 assets", "crypto", "web3 assets"]),
};

function matchedPreference(values, candidate, aliases, optionValues = []) {
  const accepted = new Set([...(aliases[candidate] || []), ...optionValues].map(preferenceKey));
  return values.find((value) => accepted.has(preferenceKey(value))) || null;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;
// Index levels (^NSEI), futures (GC=F) and FX pairs (INR=X) are not amounts of
// money per unit, so they keep the units Yahoo reports (the market pulse tiles
// label them explicitly).
const NATIVE_UNITS = /^\^|=[FX]$/;

// Aviral's UI shows every price with a rupee sign and compares it with a rupee
// buy price. A USD quote must therefore be converted with a real rate, and if
// no rate is available the ticker is left out rather than shown wrongly.
async function convertToRupees(details) {
  const currencies = new Set();
  for (const [ticker, quote] of Object.entries(details)) {
    if (NATIVE_UNITS.test(ticker)) continue;
    const currency = quote && typeof quote.currency === "string" ? quote.currency.trim() : "";
    if (currency && currency.toUpperCase() !== "INR") currencies.add(currency);
  }
  if (currencies.size === 0) return details;
  const usable = [...currencies].filter((currency) => CURRENCY_CODE.test(currency));
  let rates = {};
  if (usable.length > 0) {
    try {
      rates = (await yahooProvider.getQuoteDetails(usable.map((currency) => `${currency}INR=X`))) || {};
    } catch (error) {
      rates = {};
    }
  }
  const converted = {};
  for (const [ticker, quote] of Object.entries(details)) {
    const currency = quote && typeof quote.currency === "string" ? quote.currency.trim() : "";
    if (NATIVE_UNITS.test(ticker) || !currency || currency.toUpperCase() === "INR") {
      converted[ticker] = quote;
      continue;
    }
    const rate = rates[`${currency}INR=X`] && rates[`${currency}INR=X`].price;
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(quote.price)) continue;
    converted[ticker] = {
      ...quote,
      price: Math.round(quote.price * rate * 100) / 100,
      currency: "INR",
      originalPrice: quote.price,
      originalCurrency: currency,
    };
  }
  return converted;
}

async function getPrices(userId, query = {}) {
  const context = await portfolioModel.getPortfolioContext(userId);
  const tickers = parseTickers(query.tickers);
  const requested = tickers.length > 0 ? tickers : heldTickers(context);
  if (requested.length === 0) return { prices: {}, ...marketProvenance() };
  try {
    if (typeof yahooProvider.getQuoteDetails === "function") {
      const rawDetails = await yahooProvider.getQuoteDetails(requested);
      if (!rawDetails || typeof rawDetails !== "object") throw new UpstreamServiceError();
      const details = await convertToRupees(rawDetails);
      const prices = {};
      const quotes = {};
      for (const [ticker, quote] of Object.entries(details)) {
        if (!quote || typeof quote !== "object" || !Number.isFinite(quote.price)) continue;
        prices[ticker] = quote.price;
        const entry = { price: quote.price };
        if (Number.isFinite(quote.changePercent)) entry.changePercent = quote.changePercent;
        if (typeof quote.currency === "string" && quote.currency.trim() !== "") entry.currency = quote.currency;
        if (Number.isFinite(quote.originalPrice)) entry.originalPrice = quote.originalPrice;
        if (typeof quote.originalCurrency === "string") entry.originalCurrency = quote.originalCurrency;
        quotes[ticker] = entry;
      }
      if (Object.keys(prices).length === 0) throw new UpstreamServiceError();
      return { prices, quotes, ...marketProvenance() };
    }
    const raw = await yahooProvider.getQuotes(requested);
    if (!raw || typeof raw !== "object") throw new UpstreamServiceError();
    const prices = {};
    for (const [ticker, price] of Object.entries(raw)) {
      if (Number.isFinite(price)) prices[ticker] = price;
    }
    if (Object.keys(prices).length === 0) throw new UpstreamServiceError();
    return { prices, ...marketProvenance() };
  } catch (error) {
    if (error instanceof ValidationServiceError) throw error;
    throw new UpstreamServiceError();
  }
}

function newsKey(item) {
  return item.id || item.link || item.title;
}

const INTEREST_NEWS_COUNT = 5;

function interestTickersForNews(context, held) {
  const preferences = selectedPreferences(context.snapshot);
  if (preferences.industries.length === 0 && preferences.instruments.length === 0) return [];
  const risk = context.profile && typeof context.profile.risk_profile === "string" ? context.profile.risk_profile.toUpperCase() : "MODERATE";
  const heldBase = new Set((held || []).map(baseTicker));
  const scored = CANDIDATES.filter((candidate) => !heldBase.has(baseTicker(candidate.ticker))).map((candidate) => {
    const industryMatch = matchedPreference(preferences.industries, candidate.industry, INDUSTRY_ALIASES, candidate.industryOptions) ? 4 : 0;
    const instrumentMatch = matchedPreference(preferences.instruments, candidate.instrument, INSTRUMENT_ALIASES, candidate.instrumentOptions) ? 3 : 0;
    const riskFit = candidate.risks.includes(risk) ? 2 : 0;
    const counterbalance = candidate.counterbalance ? 2 : 0;
    return { ticker: candidate.ticker, preferenceScore: industryMatch + instrumentMatch, score: industryMatch + instrumentMatch + riskFit + counterbalance };
  }).filter((entry) => entry.preferenceScore > 0).sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
  return scored.slice(0, INTEREST_NEWS_COUNT).map((entry) => entry.ticker);
}

async function getNews(userId, query = {}) {
  const context = await portfolioModel.getPortfolioContext(userId);
  const held = heldTickers(context);
  const interest = interestTickersForNews(context, held).slice(0, Math.max(0, MAX_TICKERS - held.length));
  const universe = [...held, ...interest.filter((ticker) => !held.includes(ticker))].slice(0, MAX_TICKERS);
  const requested = parseTickers(query.tickers);
  const universeSet = new Set(universe.map(baseTicker));
  const tickers = requested.length > 0 ? requested.filter((ticker) => universeSet.has(baseTicker(ticker))) : universe;
  if (tickers.length === 0) return { news: [], ...marketProvenance() };
  let items;
  try {
    items = await newsProvider.getNews(tickers);
  } catch (error) {
    throw new UpstreamServiceError();
  }
  const seen = new Set();
  const news = (Array.isArray(items) ? items : []).filter((item) => {
    if (!item || typeof item !== "object" || !item.title || !item.publisher || !item.link || !item.publishedAt) return false;
    if (!isHttpsLink(item.link)) return false;
    const key = newsKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return universeSet.has(baseTicker(normalizeTicker(item.ticker || "")));
  }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 50);
  const providers = [...new Set(news.map((item) => item.provider).filter(Boolean))];
  const shaped = news.map((item) => ({
    id: item.id || item.link || item.title,
    ticker: normalizeTicker(item.ticker),
    title: item.title,
    publisher: item.publisher,
    link: item.link,
    publishedAt: item.publishedAt,
    summary: typeof item.summary === "string" ? item.summary : "",
    thumbnail: item.thumbnail || null,
  }));
  return { news: shaped, ...marketProvenance(), source: providers.length > 0 ? providers.join(", ") : "Yahoo Finance" };
}

function normalizedSeries(points) {
  if (!Array.isArray(points)) return new Map();
  const valid = points.filter((point) => point && typeof point.date === "string" && Number.isFinite(point.close) && point.close > 0);
  if (valid.length === 0) return new Map();
  const base = valid[0].close;
  return new Map(valid.map((point) => [point.date, ((point.close / base) - 1) * 100]));
}

function moneyNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : 0;
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) return 0;
  return Number(value);
}

async function getHistorical(userId, query = {}) {
  const range = query.range === undefined ? "1Y" : String(query.range).toUpperCase();
  if (!RANGES.has(range)) throw new ValidationServiceError({ range: "must be one of 1W, 1M, 3M, 6M, 1Y, ALL" });
  const context = await portfolioModel.getPortfolioContext(userId);
  const held = heldTickers(context);
  const heldSet = new Set(held);
  const queryTickers = parseTickers(query.tickers);
  const effective = (queryTickers.length > 0 ? queryTickers.filter((ticker) => heldSet.has(ticker)) : held).slice(0, 18);
  const tickers = effective;
  const requested = [...effective, "^NSEI", "^GSPC"];
  let series;
  try {
    series = await yahooProvider.getHistorical(requested, range);
  } catch (error) {
    throw new UpstreamServiceError();
  }
  if (!series || typeof series !== "object" || Object.keys(series).length === 0) throw new UpstreamServiceError();

  const normalized = {};
  for (const [ticker, points] of Object.entries(series)) normalized[ticker] = normalizedSeries(points);
  const labels = [];
  if (normalized["^NSEI"]?.size) labels.push("NIFTY 50");
  if (normalized["^GSPC"]?.size) labels.push("S&P 500");
  const availableTickers = tickers.filter((ticker) => normalized[ticker]?.size);
  labels.push(...availableTickers);
  const dates = [...new Set(Object.values(normalized).flatMap((map) => [...map.keys()]))].sort();
  const weights = new Map();
  for (const row of context.holdings) {
    const ticker = row.marketSymbol || "";
    const weight = moneyNumber(row.buyPrice || row.avg_buy_price_paise && Number(row.avg_buy_price_paise) / 100) * moneyNumber(row.quantity);
    if (ticker && weight > 0) weights.set(ticker, weight);
  }
  const data = dates.map((date) => {
    const point = { date };
    if (normalized["^NSEI"]?.has(date)) point["NIFTY 50"] = normalized["^NSEI"].get(date);
    if (normalized["^GSPC"]?.has(date)) point["S&P 500"] = normalized["^GSPC"].get(date);
    for (const ticker of availableTickers) if (normalized[ticker].has(date)) point[ticker] = normalized[ticker].get(date);
    let numerator = 0;
    let denominator = 0;
    for (const ticker of availableTickers) {
      if (normalized[ticker].has(date) && weights.has(ticker)) {
        numerator += normalized[ticker].get(date) * weights.get(ticker);
        denominator += weights.get(ticker);
      }
    }
    if (denominator > 0) point["Total Portfolio"] = Math.round((numerator / denominator) * 1e10) / 1e10;
    return point;
  });
  if (data.some((point) => Object.prototype.hasOwnProperty.call(point, "Total Portfolio"))) labels.unshift("Total Portfolio");
  return { range, data, availableLines: labels, ...marketProvenance() };
}

const INDUSTRY_OPTIONS = [
  "Technology & Software", "Renewable Energy & EV", "Banking & FinTech", "Healthcare & Pharma",
  "FMCG & Consumer Brands", "Real Estate & Infrastructure", "Automobiles & Manufacturing",
  "Defence & Aerospace", "Artificial Intelligence & Semi",
];
const INSTRUMENT_OPTIONS = [
  "Equities (Direct Stocks)", "Index & Mutual Funds", "Exchange Traded Funds (ETFs)",
  "Bonds & Fixed Income", "Gold & Precious Metals", "Real Estate (REITs)", "Crypto & Web3 Assets",
];

const CANDIDATES = [
  { ticker: "INFY.NS", name: "Infosys", industry: "IT", industryLabel: "Technology & Software", industryOptions: ["Technology & Software"], instrument: "STOCK", instrumentLabel: "Equity", instrumentOptions: ["Equities (Direct Stocks)"], risks: ["MODERATE", "AGGRESSIVE"], riskClass: "MIXED", assetGroup: "STOCK", blurb: "a large Indian IT services company" },
  { ticker: "TATAELXSI.NS", name: "Tata Elxsi", industry: "IT", industryLabel: "Technology & Software", industryOptions: ["Technology & Software"], instrument: "STOCK", instrumentLabel: "Equity", instrumentOptions: ["Equities (Direct Stocks)"], risks: ["AGGRESSIVE"], riskClass: "VOLATILE", assetGroup: "STOCK", blurb: "an engineering and design-services company" },
  { ticker: "MON100.NS", name: "Nasdaq 100 ETF", industry: "AI_SEMI", industryLabel: "Artificial Intelligence & Semi", industryOptions: ["Artificial Intelligence & Semi"], instrument: "ETF", instrumentLabel: "Index ETF", instrumentOptions: ["Exchange Traded Funds (ETFs)", "Index & Mutual Funds"], risks: ["MODERATE", "AGGRESSIVE"], riskClass: "MIXED", assetGroup: "FUND", blurb: "an ETF that tracks the Nasdaq-100, an index heavy in US technology and chip companies", counterbalance: true },
  { ticker: "ADANIGREEN.NS", name: "Adani Green Energy", industry: "RENEWABLE_EV", industryLabel: "Renewable Energy & EV", industryOptions: ["Renewable Energy & EV"], instrument: "STOCK", instrumentLabel: "Equity", instrumentOptions: ["Equities (Direct Stocks)"], risks: ["AGGRESSIVE"], riskClass: "VOLATILE", assetGroup: "STOCK", blurb: "a renewable-energy (solar and wind) power producer" },
  { ticker: "HDFCBANK.NS", name: "HDFC Bank", industry: "BANKING", industryLabel: "Banking & FinTech", industryOptions: ["Banking & FinTech"], instrument: "STOCK", instrumentLabel: "Equity", instrumentOptions: ["Equities (Direct Stocks)"], risks: ["CONSERVATIVE", "MODERATE"], riskClass: "STEADIER", assetGroup: "STOCK", blurb: "a large private-sector bank" },
  { ticker: "SUNPHARMA.NS", name: "Sun Pharma", industry: "HEALTHCARE", industryLabel: "Healthcare & Pharma", industryOptions: ["Healthcare & Pharma"], instrument: "STOCK", instrumentLabel: "Equity", instrumentOptions: ["Equities (Direct Stocks)"], risks: ["MODERATE"], riskClass: "MIXED", assetGroup: "STOCK", blurb: "a large Indian pharmaceutical company" },
  { ticker: "HINDUNILVR.NS", name: "Hindustan Unilever", industry: "FMCG", industryLabel: "FMCG & Consumer Brands", industryOptions: ["FMCG & Consumer Brands"], instrument: "STOCK", instrumentLabel: "Equity", instrumentOptions: ["Equities (Direct Stocks)"], risks: ["CONSERVATIVE", "MODERATE"], riskClass: "STEADIER", assetGroup: "STOCK", blurb: "a large consumer-goods (FMCG) company" },
  { ticker: "DLF.NS", name: "DLF", industry: "REAL_ESTATE", industryLabel: "Real Estate & Infrastructure", industryOptions: ["Real Estate & Infrastructure"], instrument: "STOCK", instrumentLabel: "Equity", instrumentOptions: ["Equities (Direct Stocks)"], risks: ["MODERATE", "AGGRESSIVE"], riskClass: "VOLATILE", assetGroup: "STOCK", blurb: "a large listed real-estate developer" },
  { ticker: "TMPV.NS", name: "Tata Motors Passenger Vehicles", industry: "AUTOMOBILES", industryLabel: "Automobiles & Manufacturing", industryOptions: ["Automobiles & Manufacturing"], instrument: "STOCK", instrumentLabel: "Equity", instrumentOptions: ["Equities (Direct Stocks)"], risks: ["MODERATE", "AGGRESSIVE"], riskClass: "VOLATILE", assetGroup: "STOCK", blurb: "a passenger-vehicle maker (cars and electric vehicles)" },
  { ticker: "HAL.NS", name: "Hindustan Aeronautics", industry: "DEFENCE", industryLabel: "Defence & Aerospace", industryOptions: ["Defence & Aerospace"], instrument: "STOCK", instrumentLabel: "Equity", instrumentOptions: ["Equities (Direct Stocks)"], risks: ["AGGRESSIVE"], riskClass: "VOLATILE", assetGroup: "STOCK", blurb: "a state-owned aircraft and defence manufacturer" },
  { ticker: "NIFTYBEES.NS", name: "Nifty 50 ETF", industry: "INDEX", industryLabel: "Broad Market Index", industryOptions: [], instrument: "INDEX_MUTUAL_FUND", instrumentLabel: "Index ETF", instrumentOptions: ["Index & Mutual Funds"], risks: ["CONSERVATIVE", "MODERATE", "AGGRESSIVE"], riskClass: "STEADIER", assetGroup: "FUND", blurb: "an ETF that tracks the Nifty 50, India's large-company index", counterbalance: true },
  { ticker: "JUNIORBEES.NS", name: "Nifty Next 50 ETF", industry: "INDEX", industryLabel: "Broad Market Index", industryOptions: [], instrument: "ETF", instrumentLabel: "ETF", instrumentOptions: ["Exchange Traded Funds (ETFs)"], risks: ["MODERATE", "AGGRESSIVE"], riskClass: "MIXED", assetGroup: "FUND", blurb: "an ETF that tracks the Nifty Next 50 index of large and upcoming companies", counterbalance: true },
  { ticker: "GILT5YBEES.NS", name: "5 Year Gilt ETF", industry: "INDEX", industryLabel: "Government Bonds", industryOptions: [], instrument: "BONDS", instrumentLabel: "Bond ETF", instrumentOptions: ["Bonds & Fixed Income"], risks: ["CONSERVATIVE"], riskClass: "STEADIER", assetGroup: "BONDS", blurb: "an ETF that holds 5-year government bonds", counterbalance: true },
  { ticker: "GOLDBEES.NS", name: "Gold ETF", industry: "GOLD", industryLabel: "Gold", industryOptions: [], instrument: "GOLD", instrumentLabel: "Gold ETF", instrumentOptions: ["Gold & Precious Metals"], risks: ["CONSERVATIVE", "MODERATE", "AGGRESSIVE"], riskClass: "MIXED", assetGroup: "GOLD", blurb: "an ETF that tracks the price of gold", counterbalance: true },
  { ticker: "EMBASSY.NS", name: "Embassy Office Parks REIT", industry: "REAL_ESTATE", industryLabel: "Real Estate (REIT)", industryOptions: ["Real Estate & Infrastructure"], instrument: "REIT", instrumentLabel: "REIT", instrumentOptions: ["Real Estate (REITs)"], risks: ["MODERATE"], riskClass: "MIXED", assetGroup: "REIT", blurb: "a real-estate investment trust (REIT) that owns office parks", counterbalance: true },
  { ticker: "BTC-INR", name: "Bitcoin (INR)", industry: "CRYPTO", industryLabel: "Crypto", industryOptions: [], instrument: "CRYPTO", instrumentLabel: "Crypto", instrumentOptions: ["Crypto & Web3 Assets"], risks: ["AGGRESSIVE"], riskClass: "VOLATILE", assetGroup: "CRYPTO", blurb: "Bitcoin priced in rupees, a very volatile crypto asset" },
];

function safeChange(value) {
  if (typeof value === "string" && /^[+-]\d+(?:\.\d+)?%$/.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  return null;
}

async function getSuggestions(userId) {
  const context = await portfolioModel.getPortfolioContext(userId);
  const preferences = selectedPreferences(context.snapshot);
  // Only claim a risk fit when the user actually set a risk profile; ranking
  // still needs a neutral default.
  const riskProfile = context.profile && typeof context.profile.risk_profile === "string" ? context.profile.risk_profile.toUpperCase() : null;
  const risk = riskProfile || "MODERATE";
  const hasPreferences = preferences.industries.length > 0 || preferences.instruments.length > 0;
  const heldSummary = summarizeHoldings(context.holdings);
  const held = new Set(context.symbols.map(baseTicker));
  const candidates = CANDIDATES.filter((candidate) => !held.has(baseTicker(candidate.ticker)));
  let quotes;
  try {
    quotes = typeof yahooProvider.getQuoteDetails === "function"
      ? await yahooProvider.getQuoteDetails(candidates.map((candidate) => candidate.ticker))
      : Object.fromEntries(Object.entries(await yahooProvider.getQuotes(candidates.map((candidate) => candidate.ticker))).map(([ticker, price]) => [ticker, { price }]));
  } catch (error) {
    throw new UpstreamServiceError();
  }
  const suggestions = candidates.filter((candidate) => quotes && quotes[candidate.ticker] && Number.isFinite(quotes[candidate.ticker].price)).map((candidate) => {
    const quote = quotes[candidate.ticker];
    const matchedIndustry = matchedPreference(preferences.industries, candidate.industry, INDUSTRY_ALIASES, candidate.industryOptions);
    const matchedInstrument = matchedPreference(preferences.instruments, candidate.instrument, INSTRUMENT_ALIASES, candidate.instrumentOptions);
    const change = safeChange(quote.changePercent ?? quote.change);
    if (change === null) return null;
    const score = (matchedIndustry ? 4 : 0) + (matchedInstrument ? 3 : 0) + (candidate.risks.includes(risk) ? 2 : 0) + (candidate.counterbalance ? 2 : 0);
    return {
      score,
      result: {
        ticker: candidate.ticker,
        name: candidate.name,
        industry: candidate.industryLabel,
        instrument: candidate.instrumentLabel,
        price: quote.price,
        change,
        rationale: buildRationale({ candidate, riskProfile, held: heldSummary, matchedIndustry, matchedInstrument, hasPreferences }),
      },
    };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.result.ticker.localeCompare(b.result.ticker)).slice(0, 6).map((entry) => entry.result);
  return { suggestions, activePreferences: { industries: preferences.industries, instruments: preferences.instruments } };
}

module.exports = {
  getPrices,
  getNews,
  getHistorical,
  getSuggestions,
  parseTickers,
  setYahooProvider,
  resetYahooProvider,
  ValidationServiceError,
  UpstreamServiceError,
  CANDIDATES,
  INDUSTRY_OPTIONS,
  INSTRUMENT_OPTIONS,
};
