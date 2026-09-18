"use strict";

const { MAX_PAISE_10CR, isPlainObject } = require("./common");

const DASHBOARD_FIELDS = new Set([
  "onboardingMethod",
  "incomes",
  "liquidAssets",
  "portfolio",
  "preferences",
  "liabilities",
  "monthlyExpenses",
  "extractedData",
]);
const PREFERENCE_FIELDS = new Set(["industries", "instruments"]);
const PORTFOLIO_FIELDS = new Set(["type", "ticker", "buyPrice", "quantity"]);
const MONEY_KEY_RE = /(amount|balance|cash|cost|emi|expense|income|investment|price|principal|rent|saving|salary|value)/i;
const RUPEE_RE = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/;
const TICKER_RE = /^[A-Z0-9][A-Z0-9._^=-]{0,19}$/;
const MAX_NESTED_ENTRIES = 24;
const MAX_MONEY_PAise = MAX_PAISE_10CR;

function fail(details, field, message) {
  details[field] = message;
}

function parseRupeesToPaise(value, field, details, { max = MAX_MONEY_PAise, allowBlank = false } = {}) {
  if (allowBlank && value === "") return 0;
  if (typeof value !== "string" || !RUPEE_RE.test(value)) {
    fail(details, field, "must be a non-negative rupee string with at most 2 decimals");
    return null;
  }
  const [whole, fraction = ""] = value.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise < 0 || paise > max) {
    fail(details, field, `must be between 0 and ${max / 100} rupees`);
    return null;
  }
  return paise;
}

function sanitizeMoneyMap(value, field, details) {
  if (value === undefined) return {};
  if (!isPlainObject(value)) {
    fail(details, field, "must be an object of rupee strings");
    return {};
  }
  const out = {};
  const entries = Object.entries(value);
  if (entries.length > MAX_NESTED_ENTRIES) {
    fail(details, field, `must contain at most ${MAX_NESTED_ENTRIES} entries`);
    return {};
  }
  for (const [key, raw] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9 _-]{0,49}$/.test(key)) {
      fail(details, `${field}.${key}`, "has an invalid field name");
      continue;
    }
    if (parseRupeesToPaise(raw, `${field}.${key}`, details, { allowBlank: true }) !== null) out[key] = raw;
  }
  return out;
}

function sanitizeBoundedObject(value, field, details, depth = 0) {
  if (!isPlainObject(value)) {
    fail(details, field, "must be a JSON object");
    return {};
  }
  if (depth > 3 || Object.keys(value).length > MAX_NESTED_ENTRIES) {
    fail(details, field, "is too deeply nested or contains too many entries");
    return {};
  }
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9 _-]{0,49}$/.test(key)) {
      fail(details, `${field}.${key}`, "has an invalid field name");
      continue;
    }
    const childField = `${field}.${key}`;
    if (isPlainObject(raw)) {
      out[key] = sanitizeBoundedObject(raw, childField, details, depth + 1);
    } else if (typeof raw === "string") {
      if (MONEY_KEY_RE.test(key) && parseRupeesToPaise(raw, childField, details, { allowBlank: true }) === null) continue;
      if (raw.length > 200) fail(details, childField, "must be <= 200 characters");
      else out[key] = raw;
    } else if (typeof raw === "boolean") {
      out[key] = raw;
    } else if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0) {
      out[key] = raw;
    } else {
      fail(details, childField, "must be a bounded string, boolean, non-negative integer, or object");
    }
  }
  return out;
}

function sanitizePreferences(value, details) {
  const source = value === undefined ? {} : value;
  if (!isPlainObject(source)) {
    fail(details, "preferences", "must be an object");
    return { industries: [], instruments: [] };
  }
  for (const key of Object.keys(source)) {
    if (!PREFERENCE_FIELDS.has(key)) fail(details, `preferences.${key}`, "unknown field");
  }
  const result = {};
  for (const key of PREFERENCE_FIELDS) {
    const list = source[key] === undefined ? [] : source[key];
    if (!Array.isArray(list) || list.length > 20 || !list.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 50)) {
      fail(details, `preferences.${key}`, "must be an array of at most 20 non-empty strings");
      result[key] = [];
      continue;
    }
    result[key] = [...new Set(list.map((item) => item.trim()))];
  }
  return result;
}

function normalizeType(value, field, details) {
  if (typeof value !== "string") {
    fail(details, field, "must be a supported asset type");
    return "OTHER";
  }
  const type = value.trim().toUpperCase().replace(/[ -]+/g, "_");
  const map = {
    STOCK: "STOCK",
    EQUITY: "STOCK",
    ETF: "ETF",
    MUTUAL_FUND: "MUTUAL_FUND",
    MF: "MUTUAL_FUND",
    FD: "FD",
    CASH: "CASH",
    CRYPTO: "CRYPTO",
    OTHER: "OTHER",
  };
  if (!map[type]) fail(details, field, "must be one of stock, etf, mutual_fund, fd, cash, crypto, other");
  return map[type] || "OTHER";
}

function parseQuantity(value, field, details) {
  if (typeof value !== "string" && typeof value !== "number") {
    fail(details, field, "must be a positive finite quantity");
    return null;
  }
  if (typeof value === "number" && (!Number.isFinite(value) || !Number.isSafeInteger(value) && !Number.isSafeInteger(Math.trunc(value)))) {
    fail(details, field, "must be a positive finite quantity");
    return null;
  }
  const text = String(value);
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) {
    fail(details, field, "must be a positive finite quantity");
    return null;
  }
  const quantity = Number(text);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000000) {
    fail(details, field, "must be greater than 0 and at most 1,000,000,000");
    return null;
  }
  return quantity;
}

function sanitizePortfolio(value, details) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) {
    fail(details, "portfolio", "must be an array of at most 20 rows");
    return [];
  }
  return value.map((row, index) => {
    const field = `portfolio[${index}]`;
    if (!isPlainObject(row)) {
      fail(details, field, "must be an object");
      return null;
    }
    for (const key of Object.keys(row)) {
      if (!PORTFOLIO_FIELDS.has(key)) fail(details, `${field}.${key}`, "unknown field");
    }
    const type = normalizeType(row.type, `${field}.type`, details);
    const ticker = typeof row.ticker === "string" ? row.ticker.trim().toUpperCase() : "";
    if (!TICKER_RE.test(ticker)) fail(details, `${field}.ticker`, "must be a safe ticker of at most 20 characters");
    const buyPricePaise = parseRupeesToPaise(row.buyPrice, `${field}.buyPrice`, details);
    const quantity = parseQuantity(row.quantity, `${field}.quantity`, details);
    if (Object.keys(details).some((key) => key.startsWith(`${field}.`))) return null;
    return { type: typeof row.type === "string" ? row.type.trim() : "", ticker, buyPrice: row.buyPrice, quantity: String(row.quantity), _buyPricePaise: buyPricePaise, _quantity: quantity };
  }).filter(Boolean).map(({ _buyPricePaise, _quantity, ...row }) => row);
}

function validateDashboardFinancials(body) {
  const errors = [];
  const details = {};
  if (!isPlainObject(body)) return { errors: ["body"], details: { body: "must be a JSON object" }, value: null };
  for (const key of Object.keys(body)) {
    if (["user_id", "email"].includes(key)) continue;
    if (!DASHBOARD_FIELDS.has(key)) fail(details, key, "unknown field");
  }

  const onboardingMethod = body.onboardingMethod === undefined ? "manual_advanced" : body.onboardingMethod;
  if (!["manual_advanced", "csv_extraction"].includes(onboardingMethod)) fail(details, "onboardingMethod", "must be manual_advanced or csv_extraction");
  let extractedData;
  if (body.extractedData !== undefined) {
    if (!isPlainObject(body.extractedData)) fail(details, "extractedData", "must be an object");
    else {
      const allowed = new Set(["fileName", "totalTransactions", "currentBalance", "monthlyRevenue", "monthlyExpenses"]);
      for (const key of Object.keys(body.extractedData)) if (!allowed.has(key)) fail(details, `extractedData.${key}`, "unknown field");
      extractedData = {};
      if (body.extractedData.fileName !== undefined) {
        if (typeof body.extractedData.fileName !== "string" || body.extractedData.fileName.length > 200) fail(details, "extractedData.fileName", "must be a string of at most 200 characters");
        else extractedData.fileName = body.extractedData.fileName;
      }
      if (body.extractedData.totalTransactions !== undefined) {
        if (!Number.isSafeInteger(body.extractedData.totalTransactions) || body.extractedData.totalTransactions < 0 || body.extractedData.totalTransactions > 100000) fail(details, "extractedData.totalTransactions", "must be a safe integer from 0 to 100000");
        else extractedData.totalTransactions = body.extractedData.totalTransactions;
      }
      for (const key of ["currentBalance", "monthlyRevenue", "monthlyExpenses"]) {
        if (body.extractedData[key] !== undefined && parseRupeesToPaise(body.extractedData[key], `extractedData.${key}`, details, { allowBlank: true }) !== null) extractedData[key] = body.extractedData[key];
      }
    }
  }
  const value = {
    onboardingMethod,
    incomes: sanitizeMoneyMap(body.incomes, "incomes", details),
    liquidAssets: sanitizeMoneyMap(body.liquidAssets, "liquidAssets", details),
    portfolio: sanitizePortfolio(body.portfolio, details),
    preferences: sanitizePreferences(body.preferences, details),
    liabilities: body.liabilities === undefined ? {} : sanitizeBoundedObject(body.liabilities, "liabilities", details),
    monthlyExpenses: sanitizeMoneyMap(body.monthlyExpenses, "monthlyExpenses", details),
  };
  if (extractedData !== undefined) value.extractedData = extractedData;

  if (Object.keys(details).length > 0) errors.push(...Object.keys(details));
  return { errors, details, value };
}

function sumMoneyMap(values, field, details) {
  let total = 0;
  for (const [key, value] of Object.entries(values)) {
    const parsed = parseRupeesToPaise(value, `${field}.${key}`, details, { allowBlank: true });
    if (parsed !== null) total += parsed;
  }
  if (!Number.isSafeInteger(total) || total > MAX_MONEY_PAise) {
    fail(details, field, `sum must be <= ${MAX_MONEY_PAise / 100} rupees`);
    return null;
  }
  return total;
}

function deriveCanonicalFinancials(financials) {
  const details = {};
  const monthlyIncomePaise = sumMoneyMap(financials.incomes, "incomes", details);
  const monthlyExpensesPaise = sumMoneyMap(financials.monthlyExpenses, "monthlyExpenses", details);
  const extracted = financials.extractedData || {};
  const csvIncome = extracted.monthlyRevenue === undefined ? 0 : parseRupeesToPaise(extracted.monthlyRevenue, "extractedData.monthlyRevenue", details, { allowBlank: true }) || 0;
  const csvExpenses = extracted.monthlyExpenses === undefined ? 0 : parseRupeesToPaise(extracted.monthlyExpenses, "extractedData.monthlyExpenses", details, { allowBlank: true }) || 0;
  const incomeTotal = monthlyIncomePaise || csvIncome;
  const expenseTotal = monthlyExpensesPaise || csvExpenses;
  let cashBalancePaise = 0;
  for (const [key, value] of Object.entries(financials.liquidAssets)) {
    if (/(cash|saving|bank|liquid)/i.test(key)) cashBalancePaise += parseRupeesToPaise(value, `liquidAssets.${key}`, details, { allowBlank: true }) || 0;
  }
  if (cashBalancePaise === 0 && extracted.currentBalance !== undefined) cashBalancePaise = parseRupeesToPaise(extracted.currentBalance, "extractedData.currentBalance", details, { allowBlank: true }) || 0;
  if (!Number.isSafeInteger(cashBalancePaise) || cashBalancePaise > MAX_MONEY_PAise) {
    fail(details, "liquidAssets", `sum must be <= ${MAX_MONEY_PAise / 100} rupees`);
    cashBalancePaise = null;
  }
  return {
    monthlyIncomePaise: incomeTotal,
    monthlyExpensesPaise: expenseTotal,
    cashBalancePaise,
    portfolio: financials.portfolio.map((row) => ({
      symbol: row.ticker,
      asset_type: normalizeType(row.type, "portfolio.type", details),
      avg_buy_price_paise: parseRupeesToPaise(row.buyPrice, "portfolio.buyPrice", details),
      quantity: Number(row.quantity),
      source: "MANUAL",
    })),
    details,
  };
}

module.exports = {
  DASHBOARD_FIELDS,
  TICKER_RE,
  parseRupeesToPaise,
  validateDashboardFinancials,
  deriveCanonicalFinancials,
  normalizeType,
};
