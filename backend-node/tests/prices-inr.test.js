"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const portfolioModel = require("../src/models/portfolioModel");
const portfolioService = require("../src/services/portfolioService");

// Aviral's UI labels every price with the rupee sign and compares it with a rupee
// buy price, so the API must never hand it a foreign-currency number.
describe("GET /portfolio/prices returns rupee prices only", () => {
  beforeEach(() => {
    portfolioModel.getPortfolioContext = async () => ({ profile: null, snapshot: null, holdings: [], symbols: [] });
  });

  function provider(details, calls = []) {
    return {
      getQuoteDetails: async (tickers) => {
        calls.push(tickers);
        return Object.fromEntries(tickers.filter((ticker) => details[ticker]).map((ticker) => [ticker, details[ticker]]));
      },
    };
  }

  it("converts a USD quote with the live USDINR rate and keeps the original for reference", async () => {
    portfolioService.setYahooProvider(provider({
      "AAPL": { price: 200, changePercent: 1.5, currency: "USD" },
      "RELIANCE.NS": { price: 1226.4, changePercent: -1.4, currency: "INR" },
      "USDINR=X": { price: 90, currency: "INR" },
    }));
    const out = await portfolioService.getPrices("u1", { tickers: "AAPL,RELIANCE.NS" });
    assert.equal(out.prices.AAPL, 18000);
    assert.equal(out.prices["RELIANCE.NS"], 1226.4);
    assert.deepEqual(out.quotes.AAPL, { price: 18000, changePercent: 1.5, currency: "INR", originalPrice: 200, originalCurrency: "USD" });
    assert.equal(out.quotes["RELIANCE.NS"].currency, "INR");
    assert.equal("originalCurrency" in out.quotes["RELIANCE.NS"], false);
  });

  it("omits a foreign quote it cannot convert instead of showing it under a rupee sign", async () => {
    portfolioService.setYahooProvider(provider({
      "AAPL": { price: 200, changePercent: 1.5, currency: "USD" },
      "RELIANCE.NS": { price: 1226.4, changePercent: -1.4, currency: "INR" },
    }));
    const out = await portfolioService.getPrices("u1", { tickers: "AAPL,RELIANCE.NS" });
    assert.deepEqual(Object.keys(out.prices), ["RELIANCE.NS"]);
  });

  it("is an upstream failure when nothing can be priced in rupees", async () => {
    portfolioService.setYahooProvider(provider({ "AAPL": { price: 200, currency: "USD" } }));
    await assert.rejects(() => portfolioService.getPrices("u1", { tickers: "AAPL" }), { code: "UPSTREAM_UNAVAILABLE" });
  });

  it("does not ask for an exchange rate when every quote is already in rupees", async () => {
    const calls = [];
    portfolioService.setYahooProvider(provider({ "TCS.NS": { price: 2105, currency: "INR" } }, calls));
    await portfolioService.getPrices("u1", { tickers: "TCS.NS" });
    assert.equal(calls.length, 1);
  });

  it("asks once per foreign currency", async () => {
    const calls = [];
    portfolioService.setYahooProvider(provider({
      "AAPL": { price: 100, currency: "USD" },
      "MSFT": { price: 400, currency: "USD" },
      "SAP.DE": { price: 200, currency: "EUR" },
      "USDINR=X": { price: 90, currency: "INR" },
      "EURINR=X": { price: 100, currency: "INR" },
    }, calls));
    const out = await portfolioService.getPrices("u1", { tickers: "AAPL,MSFT,SAP.DE" });
    assert.deepEqual(calls[1].sort(), ["EURINR=X", "USDINR=X"]);
    assert.equal(out.prices["SAP.DE"], 20000);
    assert.equal(out.prices.MSFT, 36000);
  });

  it("leaves quotes without a currency untouched (legacy providers)", async () => {
    portfolioService.setYahooProvider(provider({ "TCS.NS": { price: 2105 } }));
    const out = await portfolioService.getPrices("u1", { tickers: "TCS.NS" });
    assert.equal(out.prices["TCS.NS"], 2105);
  });
  it("leaves index levels, futures and FX pairs in their native units (the market pulse tiles)", async () => {
    portfolioService.setYahooProvider(provider({
      "^NSEI": { price: 23346.4, changePercent: 0.33, currency: "INR" },
      "^BSESN": { price: 76000, changePercent: 0.2, currency: "INR" },
      "^GSPC": { price: 7641.75, changePercent: 0.05, currency: "USD" },
      "^IXIC": { price: 25000, changePercent: 0.1, currency: "USD" },
      "GC=F": { price: 4300, changePercent: 0.4, currency: "USD" },
      "INR=X": { price: 95.86, changePercent: 0, currency: "INR" },
    }));
    const out = await portfolioService.getPrices("u1", { tickers: "^NSEI,^BSESN,^GSPC,^IXIC,GC=F,INR=X" });
    assert.equal(out.prices["^GSPC"], 7641.75);
    assert.equal(out.prices["^IXIC"], 25000);
    assert.equal(out.prices["GC=F"], 4300);
    assert.equal(out.quotes["^GSPC"].currency, "USD");
    assert.equal("originalCurrency" in out.quotes["GC=F"], false);
    assert.equal(Object.keys(out.prices).length, 6);
  });
});
