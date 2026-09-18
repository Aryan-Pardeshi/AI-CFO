"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildRationale, summarizeHoldings } = require("../src/services/rationale");

const INDEX_ETF = { name: "Nifty 50 ETF", riskClass: "STEADIER", assetGroup: "FUND", blurb: "an ETF that tracks the Nifty 50, India's large-company index" };
const SMALL_STOCK = { name: "Adani Green Energy", riskClass: "VOLATILE", assetGroup: "STOCK", blurb: "a renewable-energy power producer" };
const MID_STOCK = { name: "Infosys", riskClass: "MIXED", assetGroup: "STOCK", blurb: "a large Indian IT services company" };
const GOLD_ETF = { name: "Gold ETF", riskClass: "MIXED", assetGroup: "GOLD", blurb: "an ETF that tracks the price of gold" };
const CRYPTO = { name: "Bitcoin (INR)", riskClass: "VOLATILE", assetGroup: "CRYPTO", blurb: "Bitcoin priced in rupees" };

const NO_HOLDINGS = summarizeHoldings([]);
const stockRow = (ticker, price, qty) => ({ type: "Stock", ticker, buyPrice: String(price), quantity: String(qty) });

describe("summarizeHoldings", () => {
  it("groups dashboard rows and cost-weights the stock share", () => {
    const held = summarizeHoldings([stockRow("TCS", 100, 10), { type: "Gold", ticker: "GOLDBEES.NS", buyPrice: "50", quantity: "4" }]);
    assert.equal(held.count, 2);
    assert.deepEqual([...held.groups].sort(), ["GOLD", "STOCK"]);
    assert.ok(Math.abs(held.stockShare - 1000 / 1200) < 1e-9);
  });

  it("understands canonical holdings stored in paise", () => {
    const held = summarizeHoldings([
      { asset_type: "MUTUAL_FUND", symbol: "PPFCF", quantity: 2, avg_buy_price_paise: 100000 },
      { asset_type: "STOCK", symbol: "RELIANCE", quantity: 1, avg_buy_price_paise: 100000 },
      { asset_type: "FD", fd_principal_paise: 5000000 },
    ]);
    assert.deepEqual([...held.groups].sort(), ["BONDS", "FUND", "STOCK"]);
    // 2 x Rs 1000 fund + 1 x Rs 1000 stock + Rs 50,000 FD principal
    assert.ok(Math.abs(held.stockShare - 1000 / 53000) < 1e-9);
  });

  it("copes with nothing, blanks and unknown types", () => {
    assert.deepEqual(NO_HOLDINGS, { count: 0, groups: new Set(), stockShare: null });
    const odd = summarizeHoldings([{ type: "Mystery", ticker: "?", buyPrice: "", quantity: "" }, null]);
    assert.equal(odd.count, 1);
    assert.equal(odd.stockShare, null);
  });
});

describe("buildRationale risk balance", () => {
  it("explains how a steadier pick could cushion an aggressive profile", () => {
    const text = buildRationale({ candidate: INDEX_ETF, riskProfile: "AGGRESSIVE", held: NO_HOLDINGS, matchedIndustry: null, matchedInstrument: null });
    assert.match(text, /aggressive/);
    assert.match(text, /steadier/);
    assert.match(text, /might help cushion/);
  });

  it("says a volatile pick matches an aggressive profile", () => {
    const text = buildRationale({ candidate: SMALL_STOCK, riskProfile: "AGGRESSIVE", held: NO_HOLDINGS });
    assert.match(text, /volatile side/);
    assert.match(text, /aggressive/);
  });

  it("is honest that a volatile pick is a poor fit for a conservative profile", () => {
    const text = buildRationale({ candidate: SMALL_STOCK, riskProfile: "CONSERVATIVE", held: NO_HOLDINGS });
    assert.match(text, /much more volatile than a conservative profile usually prefers/);
    assert.match(text, /research/);
    assert.doesNotMatch(text, /might suit/);
  });

  it("covers moderate and conservative steadier picks", () => {
    assert.match(buildRationale({ candidate: INDEX_ETF, riskProfile: "MODERATE", held: NO_HOLDINGS }), /might suit a moderate risk profile/);
    assert.match(buildRationale({ candidate: INDEX_ETF, riskProfile: "CONSERVATIVE", held: NO_HOLDINGS }), /might suit your conservative risk profile/);
    assert.match(buildRationale({ candidate: MID_STOCK, riskProfile: "MODERATE", held: NO_HOLDINGS }), /mid-range/);
    assert.match(buildRationale({ candidate: MID_STOCK, riskProfile: "CONSERVATIVE", held: NO_HOLDINGS }), /more risk than a conservative profile/);
    assert.match(buildRationale({ candidate: SMALL_STOCK, riskProfile: "MODERATE", held: NO_HOLDINGS }), /more volatile than a moderate profile/);
    assert.match(buildRationale({ candidate: MID_STOCK, riskProfile: "AGGRESSIVE", held: NO_HOLDINGS }), /middle of the risk range/);
  });

  it("never claims a fit when the risk profile is unknown", () => {
    const text = buildRationale({ candidate: INDEX_ETF, riskProfile: null, held: NO_HOLDINGS });
    assert.doesNotMatch(text, /risk profile|aggressive|moderate|conservative/i);
    assert.match(text, /Nifty 50 ETF is an ETF that tracks/);
    assert.match(text, /research/);
  });
});

describe("buildRationale interests and diversification", () => {
  it("quotes the industry the user actually selected", () => {
    const text = buildRationale({ candidate: MID_STOCK, riskProfile: "MODERATE", held: NO_HOLDINGS, matchedIndustry: "Technology & Software" });
    assert.match(text, /You follow Technology & Software, and Infosys is a large Indian IT services company/);
  });

  it("falls back to the selected instrument type", () => {
    const text = buildRationale({ candidate: INDEX_ETF, riskProfile: "MODERATE", held: NO_HOLDINGS, matchedInstrument: "Index & Mutual Funds" });
    assert.match(text, /You like Index & Mutual Funds/);
  });

  it("points out an asset class the user does not hold yet", () => {
    const held = summarizeHoldings([stockRow("TCS", 100, 10)]);
    const text = buildRationale({ candidate: GOLD_ETF, riskProfile: "MODERATE", held });
    assert.match(text, /You don't hold any gold yet/);
  });

  it("notes a stock-heavy portfolio when suggesting a fund", () => {
    const held = summarizeHoldings([stockRow("TCS", 100, 10), { type: "ETF", ticker: "NIFTYBEES.NS", buyPrice: "10", quantity: "5" }]);
    const text = buildRationale({ candidate: INDEX_ETF, riskProfile: "AGGRESSIVE", held });
    assert.match(text, /Most of your money is in individual stocks/);
  });

  it("does not call a crypto position diversification", () => {
    const held = summarizeHoldings([stockRow("TCS", 100, 10), { type: "Crypto", ticker: "BTC-INR", buyPrice: "1", quantity: "1" }]);
    assert.doesNotMatch(buildRationale({ candidate: CRYPTO, riskProfile: "AGGRESSIVE", held }), /spread the risk/);
  });

  it("uses at most three sentences and puts the risk balance first", () => {
    const held = summarizeHoldings([stockRow("TCS", 100, 10)]);
    const text = buildRationale({ candidate: GOLD_ETF, riskProfile: "AGGRESSIVE", held, matchedInstrument: "Gold & Precious Metals" });
    const sentences = text.split(/(?<=\.)\s+/);
    assert.ok(sentences.length <= 3, text);
    assert.match(sentences[0], /aggressive|middle of the risk range/);
  });
});

describe("buildRationale safety", () => {
  const candidates = [INDEX_ETF, SMALL_STOCK, MID_STOCK, GOLD_ETF, CRYPTO];
  const profiles = ["CONSERVATIVE", "MODERATE", "AGGRESSIVE", null];
  const helds = [NO_HOLDINGS, summarizeHoldings([stockRow("TCS", 100, 10)])];

  it("never promises, recommends, or predicts, and never leaks internal codes", () => {
    for (const candidate of candidates) {
      for (const riskProfile of profiles) {
        for (const held of helds) {
          for (const matchedIndustry of [null, "Technology & Software"]) {
            const text = buildRationale({ candidate, riskProfile, held, matchedIndustry });
            assert.doesNotMatch(text, /\b(buy|sell|guarantee[ds]?|will|certain|surely|target price|outperform|returns?)\b/i, text);
            assert.doesNotMatch(text, /[A-Z]{2,}_[A-Z_]+/, text);
            assert.ok(/might|could|usually|treat it as/.test(text), `not hedged: ${text}`);
            assert.ok(text.length > 20 && text.endsWith("."), text);
          }
        }
      }
    }
  });
});

describe("buildRationale with no saved interests", () => {
  it("says so plainly instead of claiming a preference mismatch", () => {
    const text = buildRationale({ candidate: INDEX_ETF, riskProfile: null, held: NO_HOLDINGS, hasPreferences: false });
    assert.match(text, /You haven't saved any interests yet/);
    assert.doesNotMatch(text, /doesn't match your saved preferences/);
  });

  it("keeps the mismatch wording when interests exist but do not match", () => {
    const text = buildRationale({ candidate: INDEX_ETF, riskProfile: null, held: NO_HOLDINGS, hasPreferences: true });
    assert.match(text, /doesn't match your saved preferences/);
  });
});
