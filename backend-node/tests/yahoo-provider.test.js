"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createYahooProvider } = require("../src/providers/yahooProvider");

function chartFetch(urls) {
  return async (url) => {
    urls.push(url);
    return {
      ok: true,
      async json() {
        return { chart: { result: [{ timestamp: [1700000000, 1700086400], indicators: { adjclose: [{ adjclose: [100, 110] }] } }] } };
      },
    };
  };
}

describe("Yahoo provider benchmark index symbols", () => {
  it("requests the NIFTY 50 and S&P 500 indices instead of silently dropping them", async () => {
    const urls = [];
    const provider = createYahooProvider(chartFetch(urls));
    const series = await provider.getHistorical(["TCS", "^NSEI", "^GSPC"], "1M");
    assert.deepEqual(Object.keys(series).sort(), ["TCS", "^GSPC", "^NSEI"]);
    assert.ok(urls.some((url) => url.includes("/chart/%5ENSEI?")), "NIFTY 50 index was not requested");
    assert.ok(urls.some((url) => url.includes("/chart/%5EGSPC?")), "S&P 500 index was not requested");
  });

  it("also allows the SENSEX and NASDAQ index symbols the market pulse shows", async () => {
    const urls = [];
    const provider = createYahooProvider(chartFetch(urls));
    await provider.getQuoteDetails(["^BSESN", "^IXIC"]);
    assert.equal(urls.length, 2);
    assert.ok(urls.some((url) => url.includes("/chart/%5EBSESN?")));
    assert.ok(urls.some((url) => url.includes("/chart/%5EIXIC?")));
  });

  it("still rejects any other caret or unsafe symbol before it reaches Yahoo", async () => {
    const urls = [];
    const provider = createYahooProvider(chartFetch(urls));
    await provider.getHistorical(["^FOO", "../etc/passwd", "A B", "^NSEI"], "1M");
    assert.equal(urls.length, 1);
    assert.ok(urls[0].includes("/chart/%5ENSEI?"));
  });
});

describe("Yahoo provider quote details", () => {
  it("carries the company name from chart metadata so news can be searched by name", async () => {
    const provider = createYahooProvider(async () => ({
      ok: true,
      async json() {
        return { chart: { result: [{ meta: { regularMarketPrice: 1226.4, chartPreviousClose: 1200, currency: "INR", longName: "Reliance Industries Limited", shortName: "RELIANCE INDUSTRIES" } }] } };
      },
    }));
    const details = await provider.getQuoteDetails(["RELIANCE.NS"]);
    assert.equal(details["RELIANCE.NS"].name, "Reliance Industries Limited");
  });

  it("omits the name when Yahoo does not provide one", async () => {
    const provider = createYahooProvider(async () => ({
      ok: true,
      async json() {
        return { chart: { result: [{ meta: { regularMarketPrice: 10, chartPreviousClose: 10 } }] } };
      },
    }));
    const details = await provider.getQuoteDetails(["XYZ"]);
    assert.equal("name" in details.XYZ, false);
  });
});
