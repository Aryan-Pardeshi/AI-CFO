"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createGoogleNewsProvider } = require("../src/providers/googleNewsProvider");

const NOW = Date.parse("2026-09-19T00:00:00Z");

function item(title, pubDate, n = 1) {
  return `<item><title>${title} - Livemint</title><link>https://news.example.com/${n}</link><pubDate>${pubDate}</pubDate><source url="https://x.test">Livemint</source></item>`;
}

async function titles(items, options = {}) {
  const xml = `<rss><channel>${items.join("")}</channel></rss>`;
  const provider = createGoogleNewsProvider(async () => ({ ok: true, text: async () => xml }), 5000, { now: () => NOW, ...options });
  const out = await provider.getNews([{ ticker: "RELIANCE.NS", query: "q" }]);
  return out.map((entry) => entry.title);
}

describe("Google News freshness", () => {
  it("drops items older than 45 days and keeps recent ones", async () => {
    const result = await titles([
      item("Fresh headline", "Thu, 17 Sep 2026 18:40:37 GMT", 1),
      item("Six weeks old", "Fri, 07 Aug 2026 10:00:00 GMT", 2),
      item("Last year", "Sat, 30 Nov 2025 10:00:00 GMT", 3),
    ]);
    assert.deepEqual(result, ["Fresh headline", "Six weeks old"]);
  });

  it("honours a custom maximum age", async () => {
    const result = await titles([
      item("Two days", "Thu, 17 Sep 2026 10:00:00 GMT", 1),
      item("Three weeks", "Fri, 28 Aug 2026 10:00:00 GMT", 2),
    ], { maxAgeDays: 7 });
    assert.deepEqual(result, ["Two days"]);
  });

  it("drops items dated in the future", async () => {
    const result = await titles([item("Time traveller", "Mon, 01 Jan 2029 10:00:00 GMT", 1), item("Normal", "Thu, 17 Sep 2026 10:00:00 GMT", 2)]);
    assert.deepEqual(result, ["Normal"]);
  });
});

describe("Google News quote-page filter", () => {
  const recent = "Thu, 17 Sep 2026 10:00:00 GMT";

  it("drops price landing pages that are not news", async () => {
    const result = await titles([
      item("HDFC Bank Ltd (HDFCBANK) Share/Stock Price Live NSE/BSE", recent, 1),
      item("Reliance Industries Share Price - Live NSE: RELIANCE Stock Price &amp; Chart", recent, 2),
      item("SETFNN50 ETF Price and Chart — NSE:SETFNN50", recent, 3),
      item("Eternal Ltd. Shareholding Pattern – Promoters, FIIs &amp; DIIs", recent, 4),
      item("HDFC Bank Limited - ADR Key Financial Ratios – Valuation, Profitability", recent, 5),
      item("NIFTYBEES Share Price Today - Nippon India ETF Nifty 50 BeES Stock Analysis", recent, 6),
    ]);
    assert.deepEqual(result, []);
  });

  it("keeps genuine headlines that merely mention a share price", async () => {
    const result = await titles([
      item("HDFC Bank share price slips as CEO succession weighs on sentiment", recent, 1),
      item("Reliance shares rise 2.5% after Jefferies upgrade", recent, 2),
      item("India's Nifty 50 closes at 5-month low on elevated oil prices", recent, 3),
    ]);
    assert.equal(result.length, 3);
  });
});
