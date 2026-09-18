"use strict";

function baseTicker(ticker) {
  return String(ticker).toUpperCase().replace(/\.NS$|\.BO$/, "");
}

const YAHOO = "Yahoo Finance";
const GOOGLE = "Google News";

// Provenance travels with each item so the API can say where its headlines came from.
function tag(items, provider) {
  return items.map((item) => ({ ...item, provider }));
}

function createNewsProvider({ yahoo, google }) {
  async function getNews(tickers) {
    if (!Array.isArray(tickers) || tickers.length === 0) return [];

    let yahooItems = [];
    let yahooError = null;

    try {
      yahooItems = await yahoo.getNews(tickers);
    } catch (error) {
      yahooError = error;
      yahooItems = [];
    }

    const yahooTickers = new Set(yahooItems.map((item) => item.ticker && item.ticker.toUpperCase()));
    const missing = tickers.filter((ticker) => !yahooTickers.has(ticker.toUpperCase()));

    if (missing.length === 0) return tag(yahooItems, YAHOO);

    let nameMap = {};
    if (typeof yahoo.getQuoteDetails === "function") {
      try {
        const details = await yahoo.getQuoteDetails(missing);
        for (const [ticker, detail] of Object.entries(details)) {
          if (detail && typeof detail.name === "string" && detail.name.trim() !== "") {
            nameMap[ticker] = detail.name.trim();
          }
        }
      } catch {
        // ignore failure
      }
    }

    const queries = missing.map((ticker) => {
      const name = nameMap[ticker];
      const base = baseTicker(ticker);
      const query = name ? `"${name}" stock` : `${base} share price`;
      return { ticker, query };
    });

    let googleItems = [];
    let googleError = null;

    try {
      googleItems = await google.getNews(queries);
    } catch (error) {
      googleError = error;
      googleItems = [];
    }

    const merged = [...tag(yahooItems, YAHOO), ...tag(googleItems, GOOGLE)];
    const seen = new Set();
    const deduped = [];
    for (const item of merged) {
      const key = item.id || item.link;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    if (deduped.length === 0) {
      if (yahooError) throw yahooError;
      if (googleError) throw googleError;
    }

    return deduped;
  }

  return { getNews };
}

module.exports = { createNewsProvider };