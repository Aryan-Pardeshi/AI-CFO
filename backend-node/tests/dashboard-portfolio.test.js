"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.USERS_TABLE = process.env.USERS_TABLE || "users-test";
process.env.HOLDINGS_TABLE = process.env.HOLDINGS_TABLE || "holdings-test";
process.env.GOALS_TABLE = process.env.GOALS_TABLE || "goals-test";
process.env.LOANS_TABLE = process.env.LOANS_TABLE || "loans-test";

const { mockClient } = require("aws-sdk-client-mock");
const {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const db = require("../src/db");
const { route } = require("../src/router");
const portfolioService = require("../src/services/portfolioService");
const { CANDIDATES, INDUSTRY_OPTIONS, INSTRUMENT_OPTIONS } = portfolioService;
const { createYahooProvider } = require("../src/providers/yahooProvider");

const ddbMock = mockClient(DynamoDBDocumentClient);
db._setDocClient(ddbMock);

const JWT_SUB = "verified-cognito-sub";

function event(method, path, body, queryStringParameters) {
  const value = { requestContext: { http: { method, path } } };
  if (body !== undefined) value.body = JSON.stringify(body);
  if (queryStringParameters) value.queryStringParameters = queryStringParameters;
  return value;
}

beforeEach(() => ddbMock.reset());
afterEach(() => portfolioService.resetYahooProvider());

describe("dashboard profile", () => {
  it("returns the authenticated user's saved dashboard snapshot", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        user_id: JWT_SUB,
        onboarded: true,
        dashboard_financials: {
          onboardingMethod: "manual_advanced",
          incomes: { salary: "100000" },
          liquidAssets: {},
          portfolio: [],
          preferences: { industries: [], instruments: [] },
          liabilities: {},
          monthlyExpenses: {},
        },
      },
    });

    const response = await route(event("GET", "/dashboard/profile"), JWT_SUB);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      user: {
        hasOnboarded: true,
        financials: {
          onboardingMethod: "manual_advanced",
          incomes: { salary: "100000" },
          liquidAssets: {},
          portfolio: [],
          preferences: { industries: [], instruments: [] },
          liabilities: {},
          monthlyExpenses: {},
        },
      },
    });
    assert.equal(ddbMock.commandCalls(GetCommand)[0].args[0].input.Key.user_id, JWT_SUB);
  });

  it("returns safe empty defaults when the canonical profile is missing", async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const response = await route(event("GET", "/dashboard/profile"), JWT_SUB);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      user: {
        hasOnboarded: false,
        financials: {
          onboardingMethod: "manual_advanced",
          incomes: {}, liquidAssets: {}, portfolio: [],
          preferences: { industries: [], instruments: [] },
          liabilities: {}, monthlyExpenses: {},
        },
      },
    });
  });
});

describe("dashboard financials", () => {
  it("sanitizes money and writes only under the verified sub", async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: {
        user_id: JWT_SUB,
        onboarded: true,
        onboarding_step: 8,
      },
    });

    const financials = {
      onboardingMethod: "manual_advanced",
      incomes: { salary: "100000.25", freelance: "999.75" },
      liquidAssets: { savings: "25000" },
      portfolio: [{ type: "stock", ticker: "TCS", buyPrice: "3500.50", quantity: "2" }],
      preferences: { industries: ["IT"], instruments: ["STOCK"] },
      liabilities: { homeLoan: { emi: "20000" } },
      monthlyExpenses: { rent: "30000", food: "5000" },
      user_id: "attacker-supplied-id",
    };

    const response = await route(
      event("PUT", "/dashboard/financials", { financials }),
      JWT_SUB
    );

    assert.equal(response.statusCode, 200);
    const update = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    assert.deepEqual(update.Key, { user_id: JWT_SUB });
    assert.equal(update.ExpressionAttributeNames["#f0"], "onboarded");
    assert.equal(update.ExpressionAttributeValues[":v0"], true);
    assert.equal(update.ExpressionAttributeValues[":v1"], 8);
  });

  it("accepts the CSV extraction snapshot used by the UI", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(UpdateCommand).resolves({ Attributes: { user_id: JWT_SUB, onboarded: true } });

    const financials = {
      onboardingMethod: "csv_extraction",
      extractedData: {
        fileName: "statement.csv",
        totalTransactions: 4,
        currentBalance: "25000",
        monthlyRevenue: "100000",
        monthlyExpenses: "40000",
      },
    };

    const response = await route(event("PUT", "/dashboard/financials", { financials }), JWT_SUB);

    assert.equal(response.statusCode, 200);
    const update = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    const values = Object.values(update.ExpressionAttributeValues);
    assert.ok(values.some((value) => value && value.onboardingMethod === "csv_extraction"));
  });

  it("preserves blank optional money fields and treats them as zero", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(UpdateCommand).resolves({ Attributes: { user_id: JWT_SUB, onboarded: true } });

    const financials = {
      onboardingMethod: "manual_advanced",
      incomes: { salary: "", freelance: "" },
      liquidAssets: { savings: "" },
      monthlyExpenses: { rent: "" },
      portfolio: [],
      preferences: { industries: [], instruments: [] },
      liabilities: {},
    };

    const response = await route(event("PUT", "/dashboard/financials", { financials }), JWT_SUB);

    assert.equal(response.statusCode, 200);
    const update = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    assert.equal(update.ExpressionAttributeValues[":v3"], 0);
    assert.equal(update.ExpressionAttributeValues[":v4"], 0);
    assert.equal(update.ExpressionAttributeValues[":v5"], 0);
  });

  it("replaces only adapter-generated holdings and preserves unrelated holdings", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [
      { user_id: JWT_SUB, holding_id: "api-1", source: "UPSTOX", symbol: "INFY" },
      { user_id: JWT_SUB, holding_id: "dashboard-000-TCS", dashboard_adapter: "dashboard-financials-v1" },
    ] });
    ddbMock.on(DeleteCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({ Attributes: { user_id: JWT_SUB, onboarded: true } });
    const financials = {
      onboardingMethod: "manual_advanced",
      incomes: {}, liquidAssets: {}, monthlyExpenses: {},
      preferences: { industries: [], instruments: [] }, liabilities: {},
      portfolio: [{ type: "stock", ticker: "TCS", buyPrice: "3500.50", quantity: "2" }],
    };

    await route(event("PUT", "/dashboard/financials", { financials }), JWT_SUB);
    await route(event("PUT", "/dashboard/financials", { financials }), JWT_SUB);

    assert.equal(ddbMock.commandCalls(DeleteCommand).length, 2);
    assert.deepEqual(ddbMock.commandCalls(DeleteCommand).map((call) => call.args[0].input.Key), [
      { user_id: JWT_SUB, holding_id: "dashboard-000-TCS" },
      { user_id: JWT_SUB, holding_id: "dashboard-000-TCS" },
    ]);
    assert.equal(ddbMock.commandCalls(PutCommand).length, 2);
    assert.equal(ddbMock.commandCalls(PutCommand)[0].args[0].input.Item.avg_buy_price_paise, 350050);
    assert.equal(ddbMock.commandCalls(PutCommand)[0].args[0].input.Item.source, "MANUAL");
    assert.equal(ddbMock.commandCalls(ScanCommand).length, 0);
  });

  it("rejects negative, non-finite, unsafe, and out-of-bound money", async () => {
    const invalid = ["-1", "NaN", "Infinity", "9007199254740992", "100000001"];
    for (const value of invalid) {
      const response = await route(event("PUT", "/dashboard/financials", {
        financials: { onboardingMethod: "manual_advanced", incomes: { salary: value } },
      }), JWT_SUB);
      assert.equal(response.statusCode, 400, value);
    }
    const aggregate = await route(event("PUT", "/dashboard/financials", {
      financials: { onboardingMethod: "manual_advanced", incomes: { salary: "60000000", freelance: "60000000" } },
    }), JWT_SUB);
    assert.equal(aggregate.statusCode, 400);
    assert.equal(ddbMock.commandCalls(UpdateCommand).length, 0);
  });
});

describe("portfolio prices", () => {
  it("returns injected Yahoo quotes for safe requested tickers", async () => {
    portfolioService.setYahooProvider({
      async getQuotes(tickers) {
        assert.deepEqual(tickers, ["TCS", "INFY"]);
        return { TCS: 3500.5, INFY: 1500.25 };
      },
    });

    const response = await route(
      event("GET", "/portfolio/prices", undefined, { tickers: "TCS,INFY" }),
      JWT_SUB
    );

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepEqual(body.prices, { TCS: 3500.5, INFY: 1500.25 });
    assert.equal(body.source, "Yahoo Finance");
    assert.ok(body.as_of && Number.isFinite(Date.parse(body.as_of)));
  });

  it("omits only failed quotes when another requested quote succeeds", async () => {
    portfolioService.setYahooProvider({ getQuotes: async () => ({ TCS: 3500.5 }) });
    const response = await route(event("GET", "/portfolio/prices", undefined, { tickers: "TCS,INFY" }), JWT_SUB);
    assert.equal(response.statusCode, 200);
    const partial = JSON.parse(response.body);
    assert.deepEqual(partial.prices, { TCS: 3500.5 });
    assert.equal(partial.source, "Yahoo Finance");
    assert.ok(partial.as_of && Number.isFinite(Date.parse(partial.as_of)));
  });

  it("uses the stable upstream-unavailable envelope when every quote fails", async () => {
    portfolioService.setYahooProvider({ getQuotes: async () => ({}) });
    const response = await route(event("GET", "/portfolio/prices", undefined, { tickers: "TCS" }), JWT_SUB);
    assert.equal(response.statusCode, 502);
    assert.equal(JSON.parse(response.body).error.code, "UPSTREAM_UNAVAILABLE");
  });

  it("rejects unsafe ticker lists and unsupported historical ranges", async () => {
    const unsafe = await route(event("GET", "/portfolio/prices", undefined, { tickers: "TCS,not safe" }), JWT_SUB);
    assert.equal(unsafe.statusCode, 400);
    assert.equal(JSON.parse(unsafe.body).error.code, "VALIDATION_ERROR");
    const invalidRange = await route(event("GET", "/portfolio/historical", undefined, { range: "2Y" }), JWT_SUB);
    assert.equal(invalidRange.statusCode, 400);
  });
});

const storedPortfolio = {
  user_id: JWT_SUB,
  onboarded: true,
  risk_profile: "AGGRESSIVE",
  dashboard_financials: {
    onboardingMethod: "manual_advanced",
    incomes: {}, liquidAssets: {}, monthlyExpenses: {}, liabilities: {},
    portfolio: [
      { type: "stock", ticker: "TCS", buyPrice: "100", quantity: "1" },
      { type: "stock", ticker: "INFY", buyPrice: "300", quantity: "3" },
    ],
    preferences: { industries: ["IT"], instruments: ["ETF"] },
  },
};

describe("portfolio news and historical", () => {
  beforeEach(() => ddbMock.on(GetCommand).resolves({ Item: storedPortfolio }));

  it("deduplicates real news and never introduces unrelated tickers", async () => {
    portfolioService.setYahooProvider({
      getNews: async () => [
        { id: "n1", ticker: "TCS", title: "TCS update", publisher: "Publisher", link: "https://news/1", publishedAt: "2026-09-18T10:00:00Z", summary: "real", thumbnail: null },
        { id: "n1", ticker: "TCS", title: "TCS duplicate", publisher: "Publisher", link: "https://news/1", publishedAt: "2026-09-18T09:00:00Z", summary: "real", thumbnail: null },
        { id: "n2", ticker: "RELIANCE", title: "unrelated", publisher: "Publisher", link: "https://news/2", publishedAt: "2026-09-18T11:00:00Z", summary: "real", thumbnail: null },
      ],
    });
    const response = await route(event("GET", "/portfolio/news"), JWT_SUB);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body).news.map((item) => item.id), ["n1"]);
  });

  it("normalizes aligned series and computes a deterministic invested-weighted total from zero", async () => {
    portfolioService.setYahooProvider({
      getHistorical: async () => ({
        TCS: [{ date: "2026-01-01", close: 100 }, { date: "2026-01-02", close: 110 }],
        INFY: [{ date: "2026-01-01", close: 300 }, { date: "2026-01-02", close: 330 }],
        "^NSEI": [{ date: "2026-01-01", close: 200 }, { date: "2026-01-02", close: 220 }],
      }),
    });
    const response = await route(event("GET", "/portfolio/historical", undefined, { range: "1M" }), JWT_SUB);
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepEqual(body.availableLines, ["Total Portfolio", "NIFTY 50", "TCS", "INFY"]);
    assert.equal(body.data[0]["Total Portfolio"], 0);
    assert.equal(body.data[1]["Total Portfolio"], 10);
    assert.ok(Math.abs(body.data[1]["NIFTY 50"] - 10) < 1e-9);
  });
});

describe("Yahoo provider", () => {
  it("gets quote price and real change from crumb-free chart metadata", async () => {
    const urls = [];
    const provider = createYahooProvider(async (url) => {
      urls.push(url);
      return { ok: true, async json() { return { chart: { result: [{ meta: { regularMarketPrice: 123.45, chartPreviousClose: 100 } }] } }; } };
    });
    const details = await provider.getQuoteDetails(["TCS"]);
    assert.deepEqual(details, { TCS: { price: 123.45, changePercent: 23.45 } });
    assert.match(urls[0], /\/v8\/finance\/chart\/TCS/);
    assert.doesNotMatch(urls[0], /v7\/finance\/quote/);
  });

  it("derives quote price and real change from chart closes when metadata is absent", async () => {
    const provider = createYahooProvider(async () => ({
      ok: true,
      async json() {
        return { chart: { result: [{ timestamp: [1, 2], indicators: { quote: [{ close: [100, 110] }] } }] } };
      },
    }));
    assert.deepEqual(await provider.getQuoteDetails(["TCS"]), { TCS: { price: 110, changePercent: 10 } });
  });

  it("uses a bounded coarse interval for ALL historical data", async () => {
    let requestedUrl = "";
    const provider = createYahooProvider(async (url) => {
      requestedUrl = url;
      return { ok: true, async json() { return { chart: { result: [{ timestamp: [1], indicators: { adjclose: [{ adjclose: [1] }] } }] } }; } };
    });
    await provider.getHistorical(["TCS"], "ALL");
    assert.match(requestedUrl, /range=max/);
    assert.match(requestedUrl, /interval=1mo/);
  });

  it("covers every Aviral industry and instrument option with a transparent candidate", () => {
    for (const option of INDUSTRY_OPTIONS) {
      assert.ok(CANDIDATES.some((candidate) => candidate.industryOptions.includes(option)), `missing industry ${option}`);
    }
    for (const option of INSTRUMENT_OPTIONS) {
      assert.ok(CANDIDATES.some((candidate) => candidate.instrumentOptions.includes(option)), `missing instrument ${option}`);
    }
  });
});

describe("portfolio suggestions", () => {
  beforeEach(() => ddbMock.on(GetCommand).resolves({ Item: storedPortfolio }));

  it("uses stored preferences and risk, excludes held tickers, and uses safe live quotes", async () => {
    portfolioService.setYahooProvider({
      getQuoteDetails: async (tickers) => Object.fromEntries(tickers.map((ticker) => [ticker, { price: 123.45, changePercent: 0.42 }])),
    });
    const response = await route(event("GET", "/portfolio/suggestions"), JWT_SUB);
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepEqual(body.activePreferences, { industries: ["IT"], instruments: ["ETF"] });
    assert.ok(body.suggestions.every((item) => item.ticker !== "TCS" && item.ticker !== "INFY"));
    assert.equal(body.suggestions[0].price, 123.45);
    assert.match(body.suggestions[0].rationale, /might|could/);
    for (const item of body.suggestions) {
      assert.doesNotMatch(item.industry, /_/, `internal code leaked into industry: ${item.industry}`);
      assert.doesNotMatch(item.instrument, /_/, `internal code leaked into instrument: ${item.instrument}`);
    }
    assert.ok(!/\b(buy|sell|guaranteed|strong buy|target price|regulated advice)\b/i.test(body.suggestions.map((item) => item.rationale).join(" ")));
  });

  it("matches the exact Aviral preference labels deterministically", async () => {
    ddbMock.reset();
    ddbMock.on(GetCommand).resolves({ Item: {
      user_id: JWT_SUB,
      risk_profile: "MODERATE",
      dashboard_financials: {
        onboardingMethod: "manual_advanced", incomes: {}, liquidAssets: {}, monthlyExpenses: {}, liabilities: {},
        portfolio: [{ type: "stock", ticker: "TCS", buyPrice: "100", quantity: "1" }],
        preferences: { industries: ["Technology & Software"], instruments: ["Equities (Direct Stocks)"] },
      },
    } });
    portfolioService.setYahooProvider({
      getQuoteDetails: async (tickers) => Object.fromEntries(tickers.map((ticker) => [ticker, { price: 10, changePercent: 1 }])),
    });
    const response = await route(event("GET", "/portfolio/suggestions"), JWT_SUB);
    const body = JSON.parse(response.body);
    assert.equal(body.activePreferences.industries[0], "Technology & Software");
    assert.equal(body.suggestions[0].ticker, "INFY.NS");
    assert.match(body.suggestions[0].rationale, /Technology & Software/);
  });

  it("does not claim an unmatched candidate fits a selected preference", async () => {
    ddbMock.reset();
    ddbMock.on(GetCommand).resolves({ Item: {
      user_id: JWT_SUB,
      risk_profile: "MODERATE",
      dashboard_financials: {
        onboardingMethod: "manual_advanced", incomes: {}, liquidAssets: {}, monthlyExpenses: {}, liabilities: {},
        portfolio: [{ type: "stock", ticker: "TCS", buyPrice: "100", quantity: "1" }],
        preferences: { industries: ["Banking & FinTech"], instruments: ["Gold"] },
      },
    } });
    portfolioService.setYahooProvider({
      getQuoteDetails: async (tickers) => Object.fromEntries(tickers.map((ticker) => [ticker, { price: 10, changePercent: 1 }])),
    });
    const response = await route(event("GET", "/portfolio/suggestions"), JWT_SUB);
    const body = JSON.parse(response.body);
    assert.ok(body.suggestions.some((item) => item.ticker === "HDFCBANK.NS"));
    for (const item of body.suggestions) {
      assert.doesNotMatch(item.rationale, /your .* preference/i);
      assert.match(item.rationale, /might|could|research/);
      if (item.ticker !== "HDFCBANK.NS") assert.doesNotMatch(item.rationale, /You follow Banking/);
    }
  });

  it("omits cards when Yahoo cannot provide a real change", async () => {
    portfolioService.setYahooProvider({
      getQuoteDetails: async (tickers) => Object.fromEntries(tickers.map((ticker) => [ticker, { price: 10 }])),
    });
    const response = await route(event("GET", "/portfolio/suggestions"), JWT_SUB);
    assert.deepEqual(JSON.parse(response.body).suggestions, []);
  });
});

describe("portfolio news interest universe", () => {
  const interestOnlyProfile = {
    user_id: JWT_SUB,
    risk_profile: "MODERATE",
    dashboard_financials: {
      onboardingMethod: "manual_advanced",
      incomes: {}, liquidAssets: {}, monthlyExpenses: {}, liabilities: {},
      portfolio: [],
      preferences: { industries: ["Technology & Software"], instruments: ["Equities (Direct Stocks)"] },
    },
  };

  it("serves Yahoo-backed news from saved interests when holdings are empty", async () => {
    ddbMock.reset();
    ddbMock.on(GetCommand).resolves({ Item: interestOnlyProfile });
    let requestedTickers = null;
    portfolioService.setYahooProvider({
      getNews: async (tickers) => {
        requestedTickers = tickers;
        return [
          { id: "i1", ticker: "INFY.NS", title: "Infosys update", publisher: "Publisher", link: "https://news/infy-1", publishedAt: "2026-09-18T10:00:00Z", summary: "real", thumbnail: null },
        ];
      },
    });
    const response = await route(event("GET", "/portfolio/news"), JWT_SUB);
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.news.length, 1);
    assert.equal(body.news[0].ticker, "INFY.NS");
    assert.ok(Array.isArray(requestedTickers) && requestedTickers.includes("INFY.NS"), `expected INFY.NS in ${JSON.stringify(requestedTickers)}`);
  });

  it("does not label risk-only candidates as interest news", async () => {
    ddbMock.reset();
    ddbMock.on(GetCommand).resolves({ Item: {
      ...interestOnlyProfile,
      dashboard_financials: {
        ...interestOnlyProfile.dashboard_financials,
        preferences: { industries: ["Technology & Software"], instruments: [] },
      },
    } });
    let requestedTickers = null;
    portfolioService.setYahooProvider({
      getNews: async (tickers) => {
        requestedTickers = tickers;
        return [];
      },
    });

    const response = await route(event("GET", "/portfolio/news"), JWT_SUB);
    assert.equal(response.statusCode, 200);
    // Both technology names match the selected industry; no risk-only candidate (index ETF, gold...) sneaks in.
    assert.deepEqual(requestedTickers, ["INFY.NS", "TATAELXSI.NS"]);
  });

  it("merges held tickers with deterministic interest tickers without duplicates", async () => {
    ddbMock.reset();
    ddbMock.on(GetCommand).resolves({ Item: {
      user_id: JWT_SUB,
      risk_profile: "MODERATE",
      dashboard_financials: {
        onboardingMethod: "manual_advanced", incomes: {}, liquidAssets: {}, monthlyExpenses: {}, liabilities: {},
        portfolio: [{ type: "stock", ticker: "TCS", buyPrice: "100", quantity: "1" }],
        preferences: { industries: ["Technology & Software"], instruments: ["Equities (Direct Stocks)"] },
      },
    } });
    let requestedTickers = null;
    portfolioService.setYahooProvider({
      getNews: async (tickers) => {
        requestedTickers = tickers;
        return [
          { id: "h1", ticker: "TCS", title: "TCS update", publisher: "Publisher", link: "https://news/tcs-1", publishedAt: "2026-09-18T10:00:00Z", summary: "real", thumbnail: null },
          { id: "i1", ticker: "INFY.NS", title: "Infosys update", publisher: "Publisher", link: "https://news/infy-1", publishedAt: "2026-09-18T11:00:00Z", summary: "real", thumbnail: null },
        ];
      },
    });
    const response = await route(event("GET", "/portfolio/news"), JWT_SUB);
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepEqual(body.news.map((item) => item.id), ["i1", "h1"]);
    assert.ok(requestedTickers.includes("TCS"), `expected TCS in ${JSON.stringify(requestedTickers)}`);
    assert.ok(requestedTickers.includes("INFY.NS"), `expected INFY.NS in ${JSON.stringify(requestedTickers)}`);
    assert.equal(new Set(requestedTickers.map((t) => String(t).toUpperCase())).size, requestedTickers.length);
    assert.ok(requestedTickers.length <= 20);
  });

  it("restricts query tickers to the held-or-interest universe and never proxies arbitrary tickers", async () => {
    ddbMock.reset();
    ddbMock.on(GetCommand).resolves({ Item: interestOnlyProfile });
    let requestedTickers = null;
    portfolioService.setYahooProvider({
      getNews: async (tickers) => {
        requestedTickers = tickers;
        return [
          { id: "i1", ticker: "INFY.NS", title: "Infosys update", publisher: "Publisher", link: "https://news/infy-1", publishedAt: "2026-09-18T10:00:00Z", summary: "real", thumbnail: null },
          { id: "x1", ticker: "AAPL", title: "unrelated", publisher: "Publisher", link: "https://news/aapl-1", publishedAt: "2026-09-18T11:00:00Z", summary: "real", thumbnail: null },
        ];
      },
    });
    const allowed = await route(event("GET", "/portfolio/news", undefined, { tickers: "INFY.NS" }), JWT_SUB);
    assert.equal(allowed.statusCode, 200);
    assert.deepEqual(JSON.parse(allowed.body).news.map((item) => item.id), ["i1"]);
    assert.deepEqual(requestedTickers, ["INFY.NS"]);

    requestedTickers = null;
    const blocked = await route(event("GET", "/portfolio/news", undefined, { tickers: "AAPL" }), JWT_SUB);
    assert.equal(blocked.statusCode, 200);
    assert.deepEqual(JSON.parse(blocked.body).news, []);
    assert.ok(requestedTickers === null || !requestedTickers.map((t) => String(t).toUpperCase()).includes("AAPL"), "must not proxy arbitrary tickers");
  });

  it("keeps the 502 envelope when interest news upstream fails", async () => {
    ddbMock.reset();
    ddbMock.on(GetCommand).resolves({ Item: interestOnlyProfile });
    portfolioService.setYahooProvider({
      getNews: async () => { throw new Error("upstream down"); },
    });
    const response = await route(event("GET", "/portfolio/news"), JWT_SUB);
    assert.equal(response.statusCode, 502);
    assert.equal(JSON.parse(response.body).error.code, "UPSTREAM_UNAVAILABLE");
  });
});

const { YahooUpstreamError } = require("../src/providers/yahooProvider");

describe("hardening regressions (RED first)", () => {
  beforeEach(() => ddbMock.on(GetCommand).resolves({ Item: storedPortfolio }));

  it("prices success carries Yahoo source and ISO as_of alongside prices", async () => {
    portfolioService.setYahooProvider({ getQuotes: async () => ({ TCS: 100 }) });
    const body = JSON.parse((await route(event("GET", "/portfolio/prices", undefined, { tickers: "TCS" }), JWT_SUB)).body);
    assert.equal(body.source, "Yahoo Finance");
    assert.ok(body.as_of && Number.isFinite(Date.parse(body.as_of)));
    assert.deepEqual(body.prices, { TCS: 100 });
  });

  it("news success carries Yahoo source and ISO as_of alongside news", async () => {
    portfolioService.setYahooProvider({
      getNews: async () => [{ id: "n1", ticker: "TCS", title: "t", publisher: "p", link: "https://news/1", publishedAt: "2026-09-18T10:00:00Z", summary: "", thumbnail: null }],
    });
    const body = JSON.parse((await route(event("GET", "/portfolio/news"), JWT_SUB)).body);
    assert.equal(body.source, "Yahoo Finance");
    assert.ok(body.as_of && Number.isFinite(Date.parse(body.as_of)));
  });

  it("historical success carries Yahoo source and ISO as_of", async () => {
    portfolioService.setYahooProvider({
      getHistorical: async () => ({ TCS: [{ date: "2026-01-01", close: 100 }, { date: "2026-01-02", close: 110 }], "^NSEI": [{ date: "2026-01-01", close: 200 }, { date: "2026-01-02", close: 220 }] }),
    });
    const body = JSON.parse((await route(event("GET", "/portfolio/historical", undefined, { range: "1M" }), JWT_SUB)).body);
    assert.equal(body.source, "Yahoo Finance");
    assert.ok(body.as_of && Number.isFinite(Date.parse(body.as_of)));
  });

  it("prices returns additive quotes with finite price/changePercent/currency when provider supports getQuoteDetails", async () => {
    portfolioService.setYahooProvider({
      getQuotes: async (t) => ({ TCS: 100 }),
      getQuoteDetails: async () => ({ TCS: { price: 100, changePercent: 1.5, currency: "INR" }, BAD: { price: NaN, changePercent: Infinity, currency: "INR" } }),
    });
    const body = JSON.parse((await route(event("GET", "/portfolio/prices", undefined, { tickers: "TCS" }), JWT_SUB)).body);
    assert.deepEqual(body.prices, { TCS: 100 });
    assert.equal(body.quotes.TCS.price, 100);
    assert.equal(body.quotes.TCS.changePercent, 1.5);
    assert.equal(body.quotes.TCS.currency, "INR");
    assert.ok(!body.quotes.BAD);
  });

  it("provider reads currency from Yahoo chart metadata", async () => {
    const provider = createYahooProvider(async () => ({
      ok: true,
      async json() { return { chart: { result: [{ meta: { regularMarketPrice: 50, chartPreviousClose: 40, currency: "INR" } }] } }; },
    }));
    assert.deepEqual(await provider.getQuoteDetails(["TCS"]), { TCS: { price: 50, changePercent: 25, currency: "INR" } });
  });

  it("provider getNews throws only when every Yahoo request rejects; empty fulfilled feeds stay empty", async () => {
    const allFail = createYahooProvider(async () => { throw new Error("down"); });
    await assert.rejects(() => allFail.getNews(["TCS", "INFY"]), YahooUpstreamError);
    const allEmpty = createYahooProvider(async () => ({ ok: true, async json() { return { news: [] }; } }));
    assert.deepEqual(await allEmpty.getNews(["TCS"]), []);
  });

  it("provider getNews partial success does not throw when one ticker succeeds", async () => {
    const provider = createYahooProvider(async (url) => {
      if (String(url).includes("GOOD")) return { ok: true, async json() { return { news: [] }; } };
      throw new Error("down");
    });
    assert.deepEqual(await provider.getNews(["GOOD", "BAD"]), []);
  });

  it("safe news links: drops javascript/data/malformed/http, keeps https", async () => {
    portfolioService.setYahooProvider({
      getNews: async () => [
        { id: "ok", ticker: "TCS", title: "t", publisher: "p", link: "https://news/ok", publishedAt: "2026-09-18T10:00:00Z", summary: "", thumbnail: null },
        { id: "js", ticker: "TCS", title: "t", publisher: "p", link: "javascript:alert(1)", publishedAt: "2026-09-18T10:00:00Z", summary: "", thumbnail: null },
        { id: "data", ticker: "TCS", title: "t", publisher: "p", link: "data:text/html,hi", publishedAt: "2026-09-18T10:00:00Z", summary: "", thumbnail: null },
        { id: "http", ticker: "TCS", title: "t", publisher: "p", link: "http://news/plain", publishedAt: "2026-09-18T10:00:00Z", summary: "", thumbnail: null },
        { id: "bad", ticker: "TCS", title: "t", publisher: "p", link: "://malformed", publishedAt: "2026-09-18T10:00:00Z", summary: "", thumbnail: null },
      ],
    });
    const body = JSON.parse((await route(event("GET", "/portfolio/news"), JWT_SUB)).body);
    assert.deepEqual(body.news.map((i) => i.id), ["ok"]);
  });

  it("provider drops non-https news links", async () => {
    const provider = createYahooProvider(async () => ({
      ok: true,
      async json() {
        return { news: [
          { uuid: "a", title: "t", publisher: "p", link: "https://news/a", providerPublishTime: 1758189600, summary: "" },
          { uuid: "b", title: "t", publisher: "p", link: "javascript:alert(1)", providerPublishTime: 1758189600, summary: "" },
          { uuid: "c", title: "t", publisher: "p", link: "http://news/c", providerPublishTime: 1758189600, summary: "" },
        ] };
      },
    }));
    assert.deepEqual((await provider.getNews(["TCS"])).map((i) => i.id), ["a"]);
  });

  it("historical query tickers scope to held portfolio and never proxy arbitrary symbols", async () => {
    let seen = null;
    portfolioService.setYahooProvider({ getHistorical: async (t) => { seen = t; return { TCS: [{ date: "2026-01-01", close: 1 }] }; } });
    await route(event("GET", "/portfolio/historical", undefined, { range: "1M", tickers: "TCS,AAPL" }), JWT_SUB);
    assert.ok(seen.includes("TCS"));
    assert.ok(!seen.map(String).map((s) => s.toUpperCase()).includes("AAPL"));
    assert.ok(!seen.includes("INFY"));
  });

  it("historical preserves both benchmarks within the 20-symbol cap", async () => {
    ddbMock.reset();
    const holdings = Array.from({ length: 20 }, (_, i) => ({ type: "stock", ticker: `T${i}`, buyPrice: "10", quantity: "1" }));
    ddbMock.on(GetCommand).resolves({ Item: { user_id: JWT_SUB, risk_profile: "MODERATE", dashboard_financials: { onboardingMethod: "manual_advanced", incomes: {}, liquidAssets: {}, monthlyExpenses: {}, liabilities: {}, portfolio: holdings, preferences: { industries: [], instruments: [] } } } });
    let seen = null;
    portfolioService.setYahooProvider({ getHistorical: async (t) => { seen = t; return {}; } });
    await route(event("GET", "/portfolio/historical", undefined, { range: "1M" }), JWT_SUB).catch(() => {});
    assert.ok(seen.includes("^NSEI") && seen.includes("^GSPC"));
    assert.ok(seen.length <= 20);
  });
});

describe("new endpoint routing", () => {
  it("routes each of the six dashboard and portfolio endpoints", async () => {
    ddbMock.on(GetCommand).resolves({ Item: storedPortfolio });
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    portfolioService.setYahooProvider({
      getQuotes: async (tickers) => Object.fromEntries(tickers.map((ticker) => [ticker, 1])),
      getNews: async () => [],
      getHistorical: async () => ({ "^NSEI": [{ date: "2026-01-01", close: 1 }], "^GSPC": [{ date: "2026-01-01", close: 1 }] }),
      getQuoteDetails: async () => ({}),
    });
    const cases = [
      ["GET", "/dashboard/profile"],
      ["PUT", "/dashboard/financials", { financials: { onboardingMethod: "manual_advanced" } }],
      ["GET", "/portfolio/prices", undefined, { tickers: "TCS" }],
      ["GET", "/portfolio/news"],
      ["GET", "/portfolio/historical", undefined, { range: "1W" }],
      ["GET", "/portfolio/suggestions"],
    ];
    for (const [method, path, body, query] of cases) {
      const response = await route(event(method, path, body, query), JWT_SUB);
      assert.notEqual(response.statusCode, 404, `${method} ${path}`);
    }
  });
});
