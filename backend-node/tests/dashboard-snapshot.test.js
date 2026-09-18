"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { snapshotFromCanonical } = require("../src/services/dashboardSnapshot");

const profile = { onboarded: true, monthly_income_paise: 8000000, monthly_expenses_paise: 3000000, cash_balance_paise: 4500000 };
const holdings = [
  { holding_id: "h1", asset_type: "STOCK", symbol: "RELIANCE", name: "Reliance", quantity: 30, avg_buy_price_paise: 1800000, source: "DEMO" },
  { holding_id: "h2", asset_type: "ETF", symbol: "NIFTYBEES", name: "Nifty BeES", quantity: 1000, avg_buy_price_paise: 26000, source: "DEMO" },
  { holding_id: "h3", asset_type: "MUTUAL_FUND", symbol: "PPFCF", name: "Parag Parikh Flexi Cap", quantity: 2000, avg_buy_price_paise: 20000, source: "DEMO" },
  { holding_id: "h4", asset_type: "FD", name: "Fixed deposit", fd_principal_paise: 30000000, fd_annual_rate: 0.07, source: "DEMO" },
];

describe("snapshotFromCanonical (what Aviral's dashboard pages read for a guided-onboarding user)", () => {
  it("maps profile money onto the summed rupee maps Overview totals", () => {
    const snap = snapshotFromCanonical({ profile, holdings: [], loans: [] });
    assert.deepEqual(snap.incomes, { total: "80000" });
    assert.deepEqual(snap.monthlyExpenses, { "Living expenses": "30000" });
    assert.deepEqual(snap.liquidAssets, { bankBalance: "45000" });
    assert.deepEqual(snap.liabilities, {});
  });

  it("lists priced holdings with Yahoo tickers and keeps the fixed deposit out of the ledger", () => {
    const snap = snapshotFromCanonical({ profile, holdings, loans: [] });
    assert.deepEqual(snap.portfolio, [
      { type: "Stock", ticker: "RELIANCE.NS", buyPrice: "18000", quantity: "30" },
      { type: "ETF", ticker: "NIFTYBEES.NS", buyPrice: "260", quantity: "1000" },
      { type: "Mutual Fund", ticker: "PPFCF", buyPrice: "200", quantity: "2000" },
    ]);
    assert.ok(snap.portfolio.every((row) => /^[A-Z0-9][A-Z0-9._-]*$/.test(row.ticker)), "every ticker must be safe to send to the prices route");
    assert.deepEqual(snap.liquidAssets, { bankBalance: "45000", fixedDeposits: "300000" });
  });

  it("turns each loan into its monthly EMI under the key Overview already understands", () => {
    const loans = [
      { loan_id: "l1", loan_type: "HOME", name: "Home loan", principal_paise: 500000000, outstanding_paise: 420000000, annual_rate: 0.085, tenure_months: 240 },
      { loan_id: "l2", loan_type: "CAR", name: "Car loan", principal_paise: 100000000, outstanding_paise: 80000000, annual_rate: 0, tenure_months: 50 },
      { loan_id: "l3", loan_type: "CAR", name: "Second car", principal_paise: 5000000, outstanding_paise: 5000000, annual_rate: 0, tenure_months: 50 },
    ];
    const snap = snapshotFromCanonical({ profile, holdings: [], loans });
    assert.ok(Math.abs(Number(snap.liabilities.homeLoanEmi) - 43391) <= 1.01, snap.liabilities.homeLoanEmi);
    assert.equal(snap.liabilities.carLoanEmi, "21000");
    assert.deepEqual(Object.keys(snap.liabilities).sort(), ["carLoanEmi", "homeLoanEmi"]);
  });

  it("maps the other loan types and skips loans it cannot compute", () => {
    const loans = [
      { loan_type: "PERSONAL", principal_paise: 1200000, annual_rate: 0, tenure_months: 12 },
      { loan_type: "EDUCATION", principal_paise: 2400000, annual_rate: 0, tenure_months: 24 },
      { loan_type: "CREDIT_CARD", principal_paise: 600000, annual_rate: 0, tenure_months: 6 },
      { loan_type: "OTHER", principal_paise: 300000, annual_rate: 0, tenure_months: 3 },
      { loan_type: "HOME", name: "no numbers" },
    ];
    const snap = snapshotFromCanonical({ profile, holdings: [], loans });
    assert.deepEqual(snap.liabilities, {
      personalLoanEmi: "1000", educationLoanEmi: "1000", creditCardDebt: "1000", otherLoanEmi: "1000",
    });
  });

  it("is empty, never invented, when the profile has no money fields", () => {
    const snap = snapshotFromCanonical({ profile: { onboarded: false }, holdings: [], loans: [] });
    assert.deepEqual(snap.incomes, {});
    assert.deepEqual(snap.monthlyExpenses, {});
    assert.deepEqual(snap.liquidAssets, {});
    assert.deepEqual(snap.portfolio, []);
    assert.deepEqual(snap.liabilities, {});
    assert.deepEqual(snap.preferences, { industries: [], instruments: [] });
  });

  it("copes with a missing profile and odd rows", () => {
    const snap = snapshotFromCanonical({ profile: null, holdings: [null, { asset_type: "STOCK" }, { asset_type: "STOCK", symbol: "TCS", quantity: 1 }], loans: [null] });
    assert.deepEqual(snap.portfolio, [{ type: "Stock", ticker: "TCS.NS", buyPrice: "0", quantity: "1" }]);
  });

  it("shows a manually valued holding at its cost with quantity 1", () => {
    const snap = snapshotFromCanonical({
      profile,
      holdings: [{ asset_type: "OTHER", symbol: "OLD-FUND", name: "Inherited fund", quantity: 1, avg_buy_price_paise: 275000, manual_current_value_paise: 275000 }],
      loans: [],
    });
    assert.deepEqual(snap.portfolio, [{ type: "Other", ticker: "OLD-FUND", buyPrice: "2750", quantity: "1" }]);
  });
});
