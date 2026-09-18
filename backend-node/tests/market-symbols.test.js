"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { resolveMarketSymbol } = require("../src/services/marketSymbols");

describe("resolveMarketSymbol for dashboard snapshot rows (the user typed the exact ticker)", () => {
  it("keeps what the user typed, upper-cased", () => {
    assert.equal(resolveMarketSymbol({ type: "Stock", ticker: "reliance.ns" }), "RELIANCE.NS");
    assert.equal(resolveMarketSymbol({ type: "Stock", ticker: "AAPL" }), "AAPL");
  });

  it("does not guess an exchange for a bare ticker the user typed", () => {
    assert.equal(resolveMarketSymbol({ type: "Stock", ticker: "TCS" }), "TCS");
  });

  it("rejects free text that is not a symbol", () => {
    assert.equal(resolveMarketSymbol({ type: "Stock", ticker: "Reliance Industries" }), null);
    assert.equal(resolveMarketSymbol({ type: "Stock", ticker: "" }), null);
    assert.equal(resolveMarketSymbol({ type: "Stock" }), null);
  });
});

describe("resolveMarketSymbol for canonical holdings (bare NSE symbols from onboarding)", () => {
  it("maps stocks and ETFs to their NSE ticker", () => {
    assert.equal(resolveMarketSymbol({ asset_type: "STOCK", symbol: "RELIANCE" }), "RELIANCE.NS");
    assert.equal(resolveMarketSymbol({ asset_type: "ETF", symbol: "niftybees" }), "NIFTYBEES.NS");
  });

  it("keeps an explicit exchange suffix", () => {
    assert.equal(resolveMarketSymbol({ asset_type: "STOCK", symbol: "TCS.BO" }), "TCS.BO");
    assert.equal(resolveMarketSymbol({ asset_type: "STOCK", symbol: "TCS.NS" }), "TCS.NS");
  });

  it("maps a bare crypto symbol to its rupee pair", () => {
    assert.equal(resolveMarketSymbol({ asset_type: "CRYPTO", symbol: "BTC" }), "BTC-INR");
    assert.equal(resolveMarketSymbol({ asset_type: "CRYPTO", symbol: "ETH-INR" }), "ETH-INR");
  });

  it("has no Yahoo symbol for mutual funds, deposits, cash or unknown types", () => {
    assert.equal(resolveMarketSymbol({ asset_type: "MUTUAL_FUND", symbol: "PPFCF" }), null);
    assert.equal(resolveMarketSymbol({ asset_type: "FD", name: "Fixed deposit" }), null);
    assert.equal(resolveMarketSymbol({ asset_type: "CASH" }), null);
    assert.equal(resolveMarketSymbol({ asset_type: "OTHER", symbol: "OLD-FUND" }), null);
  });

  it("returns null when there is nothing safe to look up", () => {
    assert.equal(resolveMarketSymbol({ asset_type: "STOCK" }), null);
    assert.equal(resolveMarketSymbol({ asset_type: "STOCK", symbol: "M&M" }), null);
    assert.equal(resolveMarketSymbol(null), null);
    assert.equal(resolveMarketSymbol(undefined), null);
  });
});
