"use strict";

const { monthlyEmiPaise } = require("./emi");
const { resolveMarketSymbol } = require("./marketSymbols");
const { safeTicker } = require("../providers/yahooProvider");

// Builds the object Aviral's dashboard pages read (rupee strings, his key names)
// from what guided onboarding stores canonically (paise, holdings and loans
// tables). Nothing is invented: a value with no source is simply left out.

const LOAN_KEYS = {
  HOME: "homeLoanEmi",
  CAR: "carLoanEmi",
  PERSONAL: "personalLoanEmi",
  EDUCATION: "educationLoanEmi",
  CREDIT_CARD: "creditCardDebt",
  OTHER: "otherLoanEmi",
};

const TYPE_LABELS = {
  STOCK: "Stock",
  ETF: "ETF",
  MUTUAL_FUND: "Mutual Fund",
  CRYPTO: "Crypto",
  OTHER: "Other",
};

function rupees(paise) {
  if (!Number.isFinite(paise) || paise < 0) return null;
  return (Math.round(paise) / 100).toFixed(2).replace(/\.00$/, "");
}

function positive(paise) {
  return Number.isFinite(paise) && paise > 0 ? paise : null;
}

function holdingRow(item) {
  if (!item || typeof item !== "object") return null;
  const assetType = String(item.asset_type || "OTHER").toUpperCase();
  if (assetType === "FD" || assetType === "CASH") return null;
  const symbol = typeof item.symbol === "string" ? item.symbol.trim().toUpperCase() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const resolved = resolveMarketSymbol(item);
  const ticker = resolved || (safeTicker(symbol) ? symbol : "");
  if (!ticker && !name) return null;
  const row = {
    type: TYPE_LABELS[assetType] || "Other",
    ticker,
    buyPrice: rupees(item.avg_buy_price_paise) || "0",
    quantity: Number.isFinite(item.quantity) ? String(item.quantity) : "0",
  };
  // No symbol Yahoo could price: show the holding under its name instead.
  if (!ticker) row.name = name;
  return row;
}

function snapshotFromCanonical({ profile, holdings = [], loans = [] } = {}) {
  const p = profile && typeof profile === "object" ? profile : {};
  const list = (Array.isArray(holdings) ? holdings : []).filter((item) => item && typeof item === "object");

  const incomes = {};
  if (positive(p.monthly_income_paise)) incomes.total = rupees(p.monthly_income_paise);

  const monthlyExpenses = {};
  if (positive(p.monthly_expenses_paise)) monthlyExpenses["Living expenses"] = rupees(p.monthly_expenses_paise);

  const liquidAssets = {};
  if (positive(p.cash_balance_paise)) liquidAssets.bankBalance = rupees(p.cash_balance_paise);
  const fdPaise = list
    .filter((item) => String(item.asset_type).toUpperCase() === "FD")
    .reduce((sum, item) => sum + (positive(item.fd_principal_paise) || 0), 0);
  if (fdPaise > 0) liquidAssets.fixedDeposits = rupees(fdPaise);

  const emiByKey = {};
  for (const loan of Array.isArray(loans) ? loans : []) {
    const emi = monthlyEmiPaise(loan);
    if (emi === null) continue;
    const key = LOAN_KEYS[String(loan.loan_type).toUpperCase()] || LOAN_KEYS.OTHER;
    emiByKey[key] = (emiByKey[key] || 0) + emi;
  }
  const liabilities = Object.fromEntries(Object.entries(emiByKey).map(([key, paise]) => [key, rupees(paise)]));

  return {
    onboardingMethod: "manual_advanced",
    incomes,
    liquidAssets,
    portfolio: list.map(holdingRow).filter(Boolean),
    preferences: { industries: [], instruments: [] },
    liabilities,
    monthlyExpenses,
  };
}

module.exports = { snapshotFromCanonical };
