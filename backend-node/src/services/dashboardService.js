"use strict";

const dashboardModel = require("../models/dashboardModel");
const { deriveCanonicalFinancials, parseRupeesToPaise, normalizeType } = require("../validators/dashboardValidator");
const { snapshotFromCanonical } = require("./dashboardSnapshot");

function emptyFinancials() {
  return {
    onboardingMethod: "manual_advanced",
    incomes: {},
    liquidAssets: {},
    portfolio: [],
    preferences: { industries: [], instruments: [] },
    liabilities: {},
    monthlyExpenses: {},
  };
}

function compatibleSnapshot(profile, holdings, loans = []) {
  const saved = profile && profile.dashboard_financials;
  if (saved && typeof saved === "object" && !Array.isArray(saved)) {
    const defaults = emptyFinancials();
    return {
      ...defaults,
      ...saved,
      incomes: saved.incomes && typeof saved.incomes === "object" ? saved.incomes : {},
      liquidAssets: saved.liquidAssets && typeof saved.liquidAssets === "object" ? saved.liquidAssets : {},
      portfolio: Array.isArray(saved.portfolio) && saved.portfolio.length > 0
        ? saved.portfolio
        : snapshotFromCanonical({ holdings }).portfolio,
      preferences: saved.preferences && typeof saved.preferences === "object" ? {
        industries: Array.isArray(saved.preferences.industries) ? saved.preferences.industries : [],
        instruments: Array.isArray(saved.preferences.instruments) ? saved.preferences.instruments : [],
      } : { industries: [], instruments: [] },
      liabilities: saved.liabilities && typeof saved.liabilities === "object" ? saved.liabilities : {},
      monthlyExpenses: saved.monthlyExpenses && typeof saved.monthlyExpenses === "object" ? saved.monthlyExpenses : {},
    };
  }
  return snapshotFromCanonical({ profile, holdings, loans });
}

async function getProfile(userId) {
  const { profile, holdings, loans } = await dashboardModel.getUserWithHoldings(userId, { withLoans: true });
  return {
    hasOnboarded: profile ? profile.onboarded === true : false,
    financials: compatibleSnapshot(profile, holdings, loans),
  };
}

async function saveFinancials(userId, financials) {
  const canonical = deriveCanonicalFinancials(financials);
  if (Object.keys(canonical.details).length > 0) {
    const error = new Error("Invalid dashboard financials");
    error.code = "VALIDATION_ERROR";
    error.details = canonical.details;
    throw error;
  }
  await dashboardModel.saveFinancials(userId, financials, canonical);
  return { hasOnboarded: true, financials };
}

module.exports = { emptyFinancials, compatibleSnapshot, getProfile, saveFinancials };
