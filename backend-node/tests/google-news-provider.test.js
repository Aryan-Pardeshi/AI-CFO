"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createGoogleNewsProvider, GoogleNewsUpstreamError } = require("../src/providers/googleNewsProvider");

const FIXTURE_PATH = path.join(__dirname, "fixtures", "google-news-rss.xml");
const FIXTURE_TEXT = fs.readFileSync(FIXTURE_PATH, "utf8");
// The fixture was captured on 2026-09-19; a fixed clock keeps the freshness filter from rotting these tests.
const CLOCK = { now: () => Date.parse("2026-09-19T00:00:00Z"), maxAgeDays: 1e6 }; // parsing tests: freshness has its own tests

describe("Google News provider", () => {
  let originalFetch;

  before(() => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses the fixture: 3 news items (the Upstox price page is a quote page and is dropped)", async () => {
    globalThis.fetch = async () => ({
      ok: true,
      async text() { return FIXTURE_TEXT; },
    });

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const items = await provider.getNews([{ ticker: "RELIANCE.NS", query: '"Reliance Industries Limited" stock' }]);

    assert.equal(items.length, 3);

    for (const item of items) {
      assert.ok(item.id, "item has id");
      assert.match(item.id, /^[0-9a-f]{16}$/, "id is 16 hex chars");
      assert.equal(item.ticker, "RELIANCE.NS");
      assert.ok(item.title && typeof item.title === "string", "item has title");
      assert.ok(item.publisher && typeof item.publisher === "string", "item has publisher from <source>");
      assert.ok(item.link && typeof item.link === "string", "item has link");
      assert.ok(item.link.startsWith("https://"), "link is https");
      assert.ok(item.publishedAt && typeof item.publishedAt === "string", "item has publishedAt");
      assert.ok(!isNaN(Date.parse(item.publishedAt)), "publishedAt is valid ISO");
      assert.equal(item.summary, "", "summary is empty string");
      assert.equal(item.thumbnail, null, "thumbnail is null");
    }

    const publishers = items.map((i) => i.publisher);
    assert.ok(!publishers.includes("Upstox"), "the Upstox price page must not be reported as news");
    assert.ok(publishers.includes("marketscreener.com"), "publisher marketscreener.com present");
    assert.ok(publishers.includes("Livemint"), "publisher Livemint present");
    assert.ok(publishers.includes("simplywall.st"), "publisher simplywall.st present");

    const titles = items.map((i) => i.title);
    assert.ok(titles.every((t) => !t.endsWith(" - marketscreener.com") && !t.endsWith(" - Livemint") && !t.endsWith(" - simplywall.st")), "title suffix removed");
  });

  it("skips item with http (non-https) link", async () => {
    const rss = `<?xml version="1.0"?><rss><channel><item><title>Valid</title><link>http://example.com/1</link><pubDate>Thu, 17 Sep 2026 18:40:37 GMT</pubDate><source>Test</source></item><item><title>Also Valid</title><link>https://example.com/2</link><pubDate>Thu, 17 Sep 2026 18:40:37 GMT</pubDate><source>Test</source></item></channel></rss>`;
    globalThis.fetch = async () => ({ ok: true, async text() { return rss; } });

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const items = await provider.getNews([{ ticker: "TEST", query: "test" }]);

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Also Valid");
  });

  it("skips item without <source>", async () => {
    const rss = `<?xml version="1.0"?><rss><channel><item><title>No Source</title><link>https://example.com/1</link><pubDate>Thu, 17 Sep 2026 18:40:37 GMT</pubDate></item><item><title>With Source</title><link>https://example.com/2</link><pubDate>Thu, 17 Sep 2026 18:40:37 GMT</pubDate><source>TestPub</source></item></channel></rss>`;
    globalThis.fetch = async () => ({ ok: true, async text() { return rss; } });

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const items = await provider.getNews([{ ticker: "TEST", query: "test" }]);

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "With Source");
  });

  it("max 6 items per query", async () => {
    const itemsXml = Array.from({ length: 10 }, (_, i) =>
      `<item><title>Item ${i}</title><link>https://example.com/${i}</link><pubDate>Thu, 17 Sep 2026 18:40:37 GMT</pubDate><source>Pub</source></item>`
    ).join("");
    const rss = `<?xml version="1.0"?><rss><channel>${itemsXml}</channel></rss>`;
    globalThis.fetch = async () => ({ ok: true, async text() { return rss; } });

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const items = await provider.getNews([{ ticker: "TEST", query: "test" }]);

    assert.equal(items.length, 6);
  });

  it("one failing query out of two is ignored", async () => {
    let callCount = 0;
    globalThis.fetch = async (url) => {
      callCount++;
      if (callCount === 1) throw new Error("network error");
      return { ok: true, async text() { return FIXTURE_TEXT; } };
    };

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const items = await provider.getNews([
      { ticker: "FAIL", query: "fail" },
      { ticker: "RELIANCE.NS", query: '"Reliance Industries Limited" stock' },
    ]);

    assert.equal(items.length, 3);
  });

  it("all failing queries throws GoogleNewsUpstreamError", async () => {
    globalThis.fetch = async () => { throw new Error("network error"); };

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    await assert.rejects(
      provider.getNews([{ ticker: "A", query: "a" }, { ticker: "B", query: "b" }]),
      (err) => err instanceof GoogleNewsUpstreamError
    );
  });

  it("empty queries returns []", async () => {
    globalThis.fetch = async () => { throw new Error("should not be called"); };

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const items = await provider.getNews([]);
    assert.deepEqual(items, []);
  });

  it("throws GoogleNewsUpstreamError on non-200 response", async () => {
    globalThis.fetch = async () => ({ ok: false, status: 404, async text() { return ""; } });

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    await assert.rejects(
      provider.getNews([{ ticker: "TEST", query: "test" }]),
      (err) => err instanceof GoogleNewsUpstreamError
    );
  });

  it("handles CDATA in title", async () => {
    const rss = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Title with <special> & chars]]></title><link>https://example.com/1</link><pubDate>Thu, 17 Sep 2026 18:40:37 GMT</pubDate><source>Test</source></item></channel></rss>`;
    globalThis.fetch = async () => ({ ok: true, async text() { return rss; } });

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const items = await provider.getNews([{ ticker: "TEST", query: "test" }]);

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Title with <special> & chars");
  });

  it("handles numeric character references", async () => {
    const rss = `<?xml version="1.0"?><rss><channel><item><title>Price &#8377; 100</title><link>https://example.com/1</link><pubDate>Thu, 17 Sep 2026 18:40:37 GMT</pubDate><source>Test</source></item></channel></rss>`;
    globalThis.fetch = async () => ({ ok: true, async text() { return rss; } });

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const items = await provider.getNews([{ ticker: "TEST", query: "test" }]);

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Price ₹ 100");
  });

  it("skips item missing title", async () => {
    const rss = `<?xml version="1.0"?><rss><channel><item><link>https://example.com/1</link><pubDate>Thu, 17 Sep 2026 18:40:37 GMT</pubDate><source>Test</source></item></channel></rss>`;
    globalThis.fetch = async () => ({ ok: true, async text() { return rss; } });

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const items = await provider.getNews([{ ticker: "TEST", query: "test" }]);

    assert.equal(items.length, 0);
  });

  it("skips item missing link", async () => {
    const rss = `<?xml version="1.0"?><rss><channel><item><title>Has Title</title><pubDate>Thu, 17 Sep 2026 18:40:37 GMT</pubDate><source>Test</source></item></channel></rss>`;
    globalThis.fetch = async () => ({ ok: true, async text() { return rss; } });

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const items = await provider.getNews([{ ticker: "TEST", query: "test" }]);

    assert.equal(items.length, 0);
  });

  it("skips item missing pubDate", async () => {
    const rss = `<?xml version="1.0"?><rss><channel><item><title>Has Title</title><link>https://example.com/1</link><source>Test</source></item></channel></rss>`;
    globalThis.fetch = async () => ({ ok: true, async text() { return rss; } });

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const items = await provider.getNews([{ ticker: "TEST", query: "test" }]);

    assert.equal(items.length, 0);
  });

  it("limits queries to max 20", async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return { ok: true, async text() { return FIXTURE_TEXT; } };
    };

    const provider = createGoogleNewsProvider(globalThis.fetch, 5000, CLOCK);
    const queries = Array.from({ length: 25 }, (_, i) => ({ ticker: `T${i}`, query: `query ${i}` }));
    await provider.getNews(queries);

    assert.equal(callCount, 20);
  });
});