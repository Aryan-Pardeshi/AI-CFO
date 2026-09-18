"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createNewsProvider } = require("../src/providers/newsProvider");

describe("News provider (composite)", () => {
  it("yahoo has items for AAPL -> google not called for AAPL", async () => {
    let googleCalled = false;
    const yahoo = {
      getNews: async (tickers) => [
        { id: "1", ticker: "AAPL", title: "Apple News", publisher: "Yahoo", link: "https://yahoo.com/1", publishedAt: "2026-01-01T00:00:00Z", summary: "", thumbnail: null },
      ],
      getQuoteDetails: async () => ({}),
    };
    const google = {
      getNews: async () => { googleCalled = true; return []; },
    };

    const provider = createNewsProvider({ yahoo, google });
    const items = await provider.getNews(["AAPL"]);

    assert.equal(items.length, 1);
    assert.equal(items[0].ticker, "AAPL");
    assert.equal(googleCalled, false);
  });

  it("yahoo empty for RELIANCE.NS -> google called with name from getQuoteDetails", async () => {
    let googleQueries = [];
    const yahoo = {
      getNews: async (tickers) => [],
      getQuoteDetails: async (tickers) => ({
        "RELIANCE.NS": { name: "Reliance Industries Limited" },
      }),
    };
    const google = {
      getNews: async (queries) => {
        googleQueries = queries;
        return [
          { id: "g1", ticker: "RELIANCE.NS", title: "Google News", publisher: "Google", link: "https://google.com/1", publishedAt: "2026-01-01T00:00:00Z", summary: "", thumbnail: null },
        ];
      },
    };

    const provider = createNewsProvider({ yahoo, google });
    const items = await provider.getNews(["RELIANCE.NS"]);

    assert.equal(items.length, 1);
    assert.equal(items[0].ticker, "RELIANCE.NS");
    assert.equal(googleQueries.length, 1);
    assert.equal(googleQueries[0].ticker, "RELIANCE.NS");
    assert.equal(googleQueries[0].query, '"Reliance Industries Limited" stock');
  });

  it("yahoo empty for RELIANCE.NS -> google called with baseSymbol when no name", async () => {
    let googleQueries = [];
    const yahoo = {
      getNews: async (tickers) => [],
      getQuoteDetails: async (tickers) => ({ "RELIANCE.NS": {} }),
    };
    const google = {
      getNews: async (queries) => {
        googleQueries = queries;
        return [
          { id: "g1", ticker: "RELIANCE.NS", title: "Google News", publisher: "Google", link: "https://google.com/1", publishedAt: "2026-01-01T00:00:00Z", summary: "", thumbnail: null },
        ];
      },
    };

    const provider = createNewsProvider({ yahoo, google });
    const items = await provider.getNews(["RELIANCE.NS"]);

    assert.equal(items.length, 1);
    assert.equal(googleQueries[0].query, "RELIANCE share price");
  });

  it("yahoo empty for RELIANCE.NS -> google called with baseSymbol when getQuoteDetails missing", async () => {
    let googleQueries = [];
    const yahoo = {
      getNews: async (tickers) => [],
      getQuoteDetails: async (tickers) => ({}),
    };
    const google = {
      getNews: async (queries) => {
        googleQueries = queries;
        return [
          { id: "g1", ticker: "RELIANCE.NS", title: "Google News", publisher: "Google", link: "https://google.com/1", publishedAt: "2026-01-01T00:00:00Z", summary: "", thumbnail: null },
        ];
      },
    };

    const provider = createNewsProvider({ yahoo, google });
    const items = await provider.getNews(["RELIANCE.NS"]);

    assert.equal(items.length, 1);
    assert.equal(googleQueries[0].query, "RELIANCE share price");
  });

  it("merge + dedupe by id then link", async () => {
    const yahoo = {
      getNews: async (tickers) => [
        { id: "same-id", ticker: "AAPL", title: "Yahoo", publisher: "Yahoo", link: "https://yahoo.com/1", publishedAt: "2026-01-01T00:00:00Z", summary: "", thumbnail: null },
        { id: "yahoo-2", ticker: "AAPL", title: "Yahoo 2", publisher: "Yahoo", link: "https://yahoo.com/2", publishedAt: "2026-01-01T00:00:00Z", summary: "", thumbnail: null },
      ],
      getQuoteDetails: async () => ({}),
    };
    const google = {
      getNews: async (queries) => [
        { id: "same-id", ticker: "AAPL", title: "Google", publisher: "Google", link: "https://google.com/1", publishedAt: "2026-01-01T00:00:00Z", summary: "", thumbnail: null },
        { id: "google-2", ticker: "AAPL", title: "Google 2", publisher: "Google", link: "https://yahoo.com/2", publishedAt: "2026-01-01T00:00:00Z", summary: "", thumbnail: null },
      ],
    };

    const provider = createNewsProvider({ yahoo, google });
    const items = await provider.getNews(["AAPL"]);

    assert.equal(items.length, 2);
    const ids = items.map((i) => i.id).sort();
    assert.deepEqual(ids, ["same-id", "yahoo-2"]);
  });

  it("yahoo throws + google ok -> google items returned", async () => {
    const yahoo = {
      getNews: async () => { throw new Error("Yahoo down"); },
      getQuoteDetails: async () => ({}),
    };
    const google = {
      getNews: async (queries) => [
        { id: "g1", ticker: "RELIANCE.NS", title: "Google News", publisher: "Google", link: "https://google.com/1", publishedAt: "2026-01-01T00:00:00Z", summary: "", thumbnail: null },
      ],
    };

    const provider = createNewsProvider({ yahoo, google });
    const items = await provider.getNews(["RELIANCE.NS"]);

    assert.equal(items.length, 1);
    assert.equal(items[0].ticker, "RELIANCE.NS");
  });

  it("both throw -> throws yahoo error", async () => {
    const yahoo = {
      getNews: async () => { throw new Error("Yahoo down"); },
      getQuoteDetails: async () => ({}),
    };
    const google = {
      getNews: async () => { throw new Error("Google down"); },
    };

    const provider = createNewsProvider({ yahoo, google });
    await assert.rejects(
      provider.getNews(["RELIANCE.NS"]),
      (err) => err.message === "Yahoo down"
    );
  });

  it("yahoo ok, google throws -> returns yahoo items", async () => {
    const yahoo = {
      getNews: async (tickers) => [
        { id: "y1", ticker: "AAPL", title: "Yahoo News", publisher: "Yahoo", link: "https://yahoo.com/1", publishedAt: "2026-01-01T00:00:00Z", summary: "", thumbnail: null },
      ],
      getQuoteDetails: async () => ({}),
    };
    const google = {
      getNews: async () => { throw new Error("Google down"); },
    };

    const provider = createNewsProvider({ yahoo, google });
    const items = await provider.getNews(["AAPL"]);

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Yahoo News");
  });

  it("empty tickers returns []", async () => {
    const yahoo = { getNews: async () => { throw new Error("should not call"); } };
    const google = { getNews: async () => { throw new Error("should not call"); } };

    const provider = createNewsProvider({ yahoo, google });
    const items = await provider.getNews([]);
    assert.deepEqual(items, []);
  });

  it("getQuoteDetails failure ignored", async () => {
    let googleQueries = [];
    const yahoo = {
      getNews: async (tickers) => [],
      getQuoteDetails: async () => { throw new Error("Quote details failed"); },
    };
    const google = {
      getNews: async (queries) => {
        googleQueries = queries;
        return [
          { id: "g1", ticker: "RELIANCE.NS", title: "Google News", publisher: "Google", link: "https://google.com/1", publishedAt: "2026-01-01T00:00:00Z", summary: "", thumbnail: null },
        ];
      },
    };

    const provider = createNewsProvider({ yahoo, google });
    const items = await provider.getNews(["RELIANCE.NS"]);

    assert.equal(items.length, 1);
    assert.equal(googleQueries[0].query, "RELIANCE share price");
  });
});