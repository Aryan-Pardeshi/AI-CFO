"use strict";

const dashboardModel = require("./dashboardModel");
const { resolveMarketSymbol } = require("../services/marketSymbols");

async function getPortfolioContext(userId) {
  const { profile, holdings } = await dashboardModel.getUserWithHoldings(userId);
  const snapshot = profile && profile.dashboard_financials && typeof profile.dashboard_financials === "object"
    ? profile.dashboard_financials
    : null;
  const snapshotRows = Array.isArray(snapshot && snapshot.portfolio) ? snapshot.portfolio : [];
  const rows = (snapshotRows.length > 0 ? snapshotRows : holdings)
    .filter((row) => row && typeof row === "object")
    .map((row) => ({ ...row, marketSymbol: resolveMarketSymbol(row) }));
  const symbols = [...new Set(rows.map((row) => row.marketSymbol).filter(Boolean))];
  return { profile, snapshot, holdings: rows, symbols };
}

module.exports = { getPortfolioContext };
