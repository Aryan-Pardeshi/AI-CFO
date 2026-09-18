"use strict";

const { safeTicker } = require("../providers/yahooProvider");

function upper(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

// The Yahoo symbol to price a holding with, or null when Yahoo cannot price it.
//
// Two row shapes reach this:
//  - dashboard snapshot rows ({ type, ticker }): the user typed the exact
//    Yahoo ticker (RELIANCE.NS, AAPL), so we keep it and never guess.
//  - canonical holdings ({ asset_type, symbol }) from guided onboarding, where
//    people enter bare Indian symbols (RELIANCE). This is an India-first app,
//    so a bare stock/ETF symbol is an NSE listing.
function resolveMarketSymbol(row) {
  if (!row || typeof row !== "object") return null;
  if (typeof row.ticker === "string") {
    const ticker = upper(row.ticker);
    return safeTicker(ticker) ? ticker : null;
  }
  const type = upper(row.asset_type);
  const symbol = upper(row.symbol);
  if (!symbol) return null;
  if (type === "STOCK" || type === "ETF") {
    if (!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(symbol)) return null;
    const resolved = symbol.includes(".") ? symbol : `${symbol}.NS`;
    return safeTicker(resolved) ? resolved : null;
  }
  if (type === "CRYPTO") {
    const resolved = symbol.includes("-") ? symbol : `${symbol}-INR`;
    return safeTicker(resolved) ? resolved : null;
  }
  return null;
}

module.exports = { resolveMarketSymbol };
