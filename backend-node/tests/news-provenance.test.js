"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const portfolioModel = require("../src/models/portfolioModel");
const portfolioService = require("../src/services/portfolioService");
const { createNewsProvider } = require("../src/providers/newsProvider");

const NOW = new Date().toISOString();

function yahooItem(ticker, n) {
  return { id: `y${n}`, ticker, title: `Yahoo ${n}`, publisher: "Zacks", link: `https://finance.yahoo.com/${n}`, publishedAt: NOW, summary: "", thumbnail: null };
}
function googleItem(ticker, n) {
  return { id: `g${n}`, ticker, title: `Google ${n}`, publisher: "Livemint", link: `https://news.example.com/${n}`, publishedAt: NOW, summary: "", thumbnail: null };
}

describe("news provenance", () => {
  beforeEach(() => {
    portfolioModel.getPortfolioContext = async () => ({ profile: null, snapshot: null, holdings: [], symbols: ["AAPL", "RELIANCE.NS"] });
  });
  afterEach(() => portfolioService.resetYahooProvider());

  it("the composite tags every item with the provider it really came from", async () => {
    const provider = createNewsProvider({
      yahoo: { getNews: async () => [yahooItem("AAPL", 1)] },
      google: { getNews: async () => [googleItem("RELIANCE.NS", 2)] },
    });
    const items = await provider.getNews(["AAPL", "RELIANCE.NS"]);
    assert.deepEqual(items.map((item) => [item.id, item.provider]), [["y1", "Yahoo Finance"], ["g2", "Google News"]]);
  });

  it("reports both sources when both contributed", async () => {
    portfolioService.setYahooProvider(
      { getNews: async () => [yahooItem("AAPL", 1)] },
      { getNews: async () => [googleItem("RELIANCE.NS", 2)] },
    );
    const out = await portfolioService.getNews("u1", {});
    assert.equal(out.source, "Yahoo Finance, Google News");
    assert.equal(out.news.length, 2);
  });

  it("reports only the source that supplied items", async () => {
    portfolioService.setYahooProvider({ getNews: async () => [yahooItem("AAPL", 1), yahooItem("RELIANCE.NS", 2)] });
    assert.equal((await portfolioService.getNews("u1", {})).source, "Yahoo Finance");

    portfolioService.setYahooProvider({ getNews: async () => [] }, { getNews: async () => [googleItem("RELIANCE.NS", 3), googleItem("AAPL", 4)] });
    assert.equal((await portfolioService.getNews("u1", {})).source, "Google News");
  });

  it("does not leak the internal provider tag into the response items", async () => {
    portfolioService.setYahooProvider({ getNews: async () => [yahooItem("AAPL", 1), yahooItem("RELIANCE.NS", 2)] });
    const out = await portfolioService.getNews("u1", {});
    for (const item of out.news) {
      assert.deepEqual(Object.keys(item).sort(), ["id", "link", "publishedAt", "publisher", "summary", "thumbnail", "ticker", "title"]);
    }
  });

  it("keeps the Yahoo label when there is nothing to report", async () => {
    portfolioModel.getPortfolioContext = async () => ({ profile: null, snapshot: null, holdings: [], symbols: [] });
    assert.equal((await portfolioService.getNews("u1", {})).source, "Yahoo Finance");
  });
});
