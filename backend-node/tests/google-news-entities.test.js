"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createGoogleNewsProvider } = require("../src/providers/googleNewsProvider");

const AMP = String.fromCharCode(38);
const NOW = Date.parse("2026-09-19T00:00:00Z"); // built from a char code so no tool can "helpfully" decode it in this file

function feed(items) {
  return `<?xml version="1.0"?><rss><channel>${items.join("")}</channel></rss>`;
}

function item({ title, source = "Livemint", link = "https://news.example.com/a", pubDate = "Thu, 17 Sep 2026 18:40:37 GMT" }) {
  return `<item><title>${title}</title><link>${link}</link><pubDate>${pubDate}</pubDate><source url="https://x.test">${source}</source></item>`;
}

async function titles(xml) {
  const provider = createGoogleNewsProvider(async () => ({ ok: true, text: async () => xml }), 5000, { now: () => NOW, maxAgeDays: 1e6 });
  const items = await provider.getNews([{ ticker: "RELIANCE.NS", query: "q" }]);
  return items.map((entry) => entry.title);
}

describe("Google News entity decoding", () => {
  it("leaves no raw entity in any title of the real captured feed", async () => {
    const xml = fs.readFileSync(path.join(__dirname, "fixtures", "google-news-rss.xml"), "utf8");
    const all = await titles(xml);
    assert.ok(all.length >= 3, `titles: ${JSON.stringify(all)}`);
    assert.ok(all.every((title) => !title.includes(`${AMP}amp;`)), "a raw entity leaked into a title");
  });

  it("decodes an ampersand in a headline", async () => {
    const [decoded] = await titles(feed([item({ title: `Tata Consumer ${AMP}amp; Nestle rally - Livemint`, pubDate: "Thu, 17 Sep 2026 18:40:37 GMT" })]));
    assert.equal(decoded, `Tata Consumer ${AMP} Nestle rally`);
  });

  it("decodes the five predefined entities and numeric references", async () => {
    const raw = `A${AMP}amp;B ${AMP}lt;C${AMP}gt; ${AMP}quot;D${AMP}quot; E${AMP}apos;s F${AMP}#39;s G${AMP}#x2019;s`;
    const [decoded] = await titles(feed([item({ title: `${raw} - Livemint` })]));
    assert.equal(decoded, `A${AMP}B <C> "D" E's F's G’s`);
  });

  it("decodes ampersand last so an escaped entity is not decoded twice", async () => {
    const [decoded] = await titles(feed([item({ title: `Tom ${AMP}amp;lt; Jerry - Livemint` })]));
    assert.equal(decoded, `Tom ${AMP}lt; Jerry`);
  });

  it("does not throw on an out-of-range numeric reference", async () => {
    const [decoded] = await titles(feed([item({ title: `Odd ${AMP}#99999999999; ref - Livemint` })]));
    assert.match(decoded, /^Odd .* ref$/);
  });

  it("keeps astral characters intact", async () => {
    const [decoded] = await titles(feed([item({ title: `Rocket ${AMP}#128640; launch - Livemint` })]));
    assert.equal(decoded, "Rocket \u{1F680} launch");
  });

  it("treats CDATA as literal text and only decodes the text around it", async () => {
    const [decoded] = await titles(feed([item({ title: `<![CDATA[Fish ${AMP}amp; Chips]]> ${AMP}amp; more - Livemint` })]));
    assert.equal(decoded, `Fish ${AMP}amp; Chips ${AMP} more`);
  });
});
