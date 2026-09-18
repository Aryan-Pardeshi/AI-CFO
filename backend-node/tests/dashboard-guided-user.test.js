"use strict";

// A user who finished the guided (8-step) onboarding has canonical holdings,
// loans and profile money, but no dashboard snapshot. Aviral's pages must work
// for them: the same rows are read by /dashboard/profile, priced by
// /portfolio/prices and charted by /portfolio/historical, so they have to agree.

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.USERS_TABLE = process.env.USERS_TABLE || "users-test";
process.env.HOLDINGS_TABLE = process.env.HOLDINGS_TABLE || "holdings-test";
process.env.GOALS_TABLE = process.env.GOALS_TABLE || "goals-test";
process.env.LOANS_TABLE = process.env.LOANS_TABLE || "loans-test";

const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const db = require("../src/db");
const { route } = require("../src/router");
const portfolioService = require("../src/services/portfolioService");

const ddbMock = mockClient(DynamoDBDocumentClient);
db._setDocClient(ddbMock);

const SUB = "guided-user-sub";
const profile = {
  user_id: SUB, onboarded: true, onboarding_step: 8, risk_profile: "AGGRESSIVE",
  monthly_income_paise: 8000000, monthly_expenses_paise: 3000000, cash_balance_paise: 4500000,
};
const holdings = [
  { user_id: SUB, holding_id: "h1", asset_type: "STOCK", symbol: "RELIANCE", name: "Reliance", quantity: 30, avg_buy_price_paise: 118000, source: "DEMO" },
  { user_id: SUB, holding_id: "h2", asset_type: "ETF", symbol: "NIFTYBEES", name: "Nifty BeES", quantity: 1000, avg_buy_price_paise: 24500, source: "DEMO" },
  { user_id: SUB, holding_id: "h3", asset_type: "MUTUAL_FUND", symbol: "PPFCF", name: "Parag Parikh Flexi Cap", quantity: 2000, avg_buy_price_paise: 8000, source: "DEMO" },
  { user_id: SUB, holding_id: "h4", asset_type: "FD", name: "Fixed deposit", fd_principal_paise: 30000000, fd_annual_rate: 0.07, source: "DEMO" },
];
const loans = [
  { user_id: SUB, loan_id: "l1", loan_type: "HOME", name: "Home loan", principal_paise: 500000000, outstanding_paise: 420000000, annual_rate: 0.085, tenure_months: 240 },
];

function event(method, path, queryStringParameters) {
  const value = { requestContext: { http: { method, path } } };
  if (queryStringParameters) value.queryStringParameters = queryStringParameters;
  return value;
}

function arrangeTables() {
  ddbMock.reset();
  ddbMock.on(GetCommand).resolves({ Item: profile });
  ddbMock.on(QueryCommand).callsFake((input) => ({
    Items: input.TableName === "loans-test" ? loans : input.TableName === "holdings-test" ? holdings : [],
  }));
}

beforeEach(arrangeTables);
afterEach(() => portfolioService.resetYahooProvider());

describe("dashboard for a guided-onboarding user", () => {
  it("GET /dashboard/profile fills Aviral's shape from canonical data", async () => {
    const response = await route(event("GET", "/dashboard/profile"), SUB);
    assert.equal(response.statusCode, 200);
    const { user } = JSON.parse(response.body);
    assert.equal(user.hasOnboarded, true);
    assert.deepEqual(user.financials.incomes, { total: "80000" });
    assert.deepEqual(user.financials.monthlyExpenses, { "Living expenses": "30000" });
    assert.deepEqual(user.financials.liquidAssets, { bankBalance: "45000", fixedDeposits: "300000" });
    assert.ok(Math.abs(Number(user.financials.liabilities.homeLoanEmi) - 43391) <= 1.01);
    assert.deepEqual(user.financials.portfolio.map((row) => [row.type, row.ticker]), [
      ["Stock", "RELIANCE.NS"], ["ETF", "NIFTYBEES.NS"], ["Mutual Fund", "PPFCF"],
    ]);
  });

  it("only reads the authenticated user's rows", async () => {
    await route(event("GET", "/dashboard/profile"), SUB);
    const keys = ddbMock.commandCalls(QueryCommand).map((call) => call.args[0].input.ExpressionAttributeValues);
    assert.ok(keys.length >= 2);
    for (const values of keys) assert.ok(Object.values(values).includes(SUB));
  });

  it("prices the same tickers the dashboard rows carry", async () => {
    const asked = [];
    portfolioService.setYahooProvider({
      getQuoteDetails: async (tickers) => {
        asked.push(tickers);
        return Object.fromEntries(tickers.map((ticker) => [ticker, { price: 100, changePercent: 1, currency: "INR" }]));
      },
    });
    const dashboard = JSON.parse((await route(event("GET", "/dashboard/profile"), SUB)).body);
    const tickers = dashboard.user.financials.portfolio.map((row) => row.ticker).join(",");
    const prices = JSON.parse((await route(event("GET", "/portfolio/prices", { tickers }), SUB)).body);
    assert.deepEqual(Object.keys(prices.prices).sort(), ["NIFTYBEES.NS", "PPFCF", "RELIANCE.NS"]);
    assert.equal(asked.length, 1);
  });

  it("with no tickers, prices the resolved holdings (never the fixed deposit or the raw bare symbols)", async () => {
    const asked = [];
    portfolioService.setYahooProvider({
      getQuoteDetails: async (tickers) => {
        asked.push(...tickers);
        return Object.fromEntries(tickers.map((ticker) => [ticker, { price: 100, currency: "INR" }]));
      },
    });
    const prices = JSON.parse((await route(event("GET", "/portfolio/prices"), SUB)).body);
    assert.deepEqual(asked.sort(), ["NIFTYBEES.NS", "RELIANCE.NS"]);
    assert.deepEqual(Object.keys(prices.prices).sort(), ["NIFTYBEES.NS", "RELIANCE.NS"]);
  });

  it("charts history for the resolved tickers, weighted by cost, alongside both benchmarks", async () => {
    let requested = null;
    const series = (base) => [{ date: "2026-09-01", close: base }, { date: "2026-09-02", close: base * 1.1 }];
    portfolioService.setYahooProvider({
      getHistorical: async (tickers) => {
        requested = tickers;
        return { "RELIANCE.NS": series(100), "NIFTYBEES.NS": series(200), "^NSEI": series(300), "^GSPC": series(400) };
      },
    });
    const response = await route(event("GET", "/portfolio/historical", { range: "1M", tickers: "RELIANCE.NS,NIFTYBEES.NS,PPFCF" }), SUB);
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    // The fund has no Yahoo symbol, so only the two priced holdings are charted, plus both benchmarks.
    assert.deepEqual(requested, ["RELIANCE.NS", "NIFTYBEES.NS", "^NSEI", "^GSPC"]);
    assert.ok(body.availableLines.includes("Total Portfolio"));
    const last = body.data[body.data.length - 1];
    assert.ok(Math.abs(last["Total Portfolio"] - 10) < 1e-6, `weighted return should be 10%, got ${last["Total Portfolio"]}`);
  });
});
