"use strict";

const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { getDocClient, tables } = require("../db");
const userModel = require("./userModel");
const holdingModel = require("./holdingModel");
const loanModel = require("./loanModel");

const DASHBOARD_ADAPTER = "dashboard-financials-v1";

// A saved dashboard snapshot already carries everything; only a user who came
// through guided onboarding needs their canonical holdings (and, for the
// dashboard itself, their loans) read.
async function getUserWithHoldings(userId, { withLoans = false } = {}) {
  const profile = await userModel.getProfile(userId);
  const hasSnapshot = Boolean(profile && profile.dashboard_financials);
  const holdings = hasSnapshot ? [] : await holdingModel.list(userId);
  const loans = withLoans && !hasSnapshot ? await loanModel.list(userId) : [];
  return { profile: profile || null, holdings, loans };
}

async function saveFinancials(userId, financials, canonical) {
  const existing = await holdingModel.list(userId);
  const generated = existing.filter((item) => item.dashboard_adapter === DASHBOARD_ADAPTER);
  for (const item of generated) await holdingModel.remove(userId, item.holding_id);

  const doc = getDocClient();
  for (const [index, row] of financials.portfolio.entries()) {
    const type = row.type.trim().toUpperCase().replace(/[ -]+/g, "_");
    const mappedType = {
      EQUITY: "STOCK",
      STOCK: "STOCK",
      ETF: "ETF",
      MUTUAL_FUND: "MUTUAL_FUND",
      MF: "MUTUAL_FUND",
      FD: "FD",
      CASH: "CASH",
      CRYPTO: "CRYPTO",
      OTHER: "OTHER",
    }[type] || "OTHER";
    const symbol = row.ticker;
    await doc.send(new PutCommand({
      TableName: tables().holdings,
      Item: {
        user_id: userId,
        holding_id: `dashboard-${String(index).padStart(3, "0")}-${symbol}`,
        asset_type: mappedType,
        source: "MANUAL",
        dashboard_adapter: DASHBOARD_ADAPTER,
        instrument_key: symbol,
        symbol,
        name: symbol,
        quantity: Number(row.quantity),
        avg_buy_price_paise: canonical.portfolio[index].avg_buy_price_paise,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }));
  }

  return userModel.updateProfile(userId, {
    onboarded: true,
    onboarding_step: 8,
    dashboard_financials: financials,
    monthly_income_paise: canonical.monthlyIncomePaise,
    monthly_expenses_paise: canonical.monthlyExpensesPaise,
    cash_balance_paise: canonical.cashBalancePaise,
  });
}

module.exports = { getUserWithHoldings, saveFinancials, DASHBOARD_ADAPTER };
