"use strict";

// Pure, deterministic "why this might suit you" text for the personalized
// ideas. It only ever describes fit (risk balance, interests, what the user
// already holds). It never predicts returns, recommends an action, or states a
// number the model could get wrong. Every sentence is hedged on purpose.

const GROUP_LABELS = {
  STOCK: "individual stocks",
  FUND: "index or mutual funds",
  BONDS: "bonds",
  GOLD: "gold",
  REIT: "real estate",
  CRYPTO: "crypto",
};

// How a held row's type maps onto the asset groups candidates belong to.
function heldGroup(row) {
  const raw = String((row && (row.type || row.asset_type)) || "").toUpperCase().replace(/[ -]+/g, "_");
  if (raw === "STOCK" || raw === "EQUITY") return "STOCK";
  if (raw === "ETF" || raw === "MUTUAL_FUND" || raw === "MF") return "FUND";
  if (raw === "BOND" || raw === "FD") return "BONDS";
  if (raw === "GOLD") return "GOLD";
  if (raw === "REAL_ESTATE" || raw === "REIT") return "REIT";
  if (raw === "CRYPTO") return "CRYPTO";
  return "OTHER";
}

function rowCost(row) {
  if (!row) return 0;
  if (row.avg_buy_price_paise !== undefined && row.avg_buy_price_paise !== null) {
    const cost = (Number(row.avg_buy_price_paise) / 100) * Number(row.quantity || 0);
    return Number.isFinite(cost) && cost > 0 ? cost : 0;
  }
  if (row.fd_principal_paise !== undefined && row.fd_principal_paise !== null) {
    const cost = Number(row.fd_principal_paise) / 100;
    return Number.isFinite(cost) && cost > 0 ? cost : 0;
  }
  const cost = Number(row.buyPrice || 0) * Number(row.quantity || 0);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

function summarizeHoldings(rows) {
  const list = Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object") : [];
  const groups = new Set(list.map(heldGroup));
  let total = 0;
  let stocks = 0;
  for (const row of list) {
    const cost = rowCost(row);
    total += cost;
    if (heldGroup(row) === "STOCK") stocks += cost;
  }
  return { count: list.length, groups, stockShare: total > 0 ? stocks / total : null };
}

// Read as "how steady is this compared with a typical single stock".
const RISK_SENTENCES = {
  AGGRESSIVE: {
    STEADIER: "Your risk profile is aggressive, so a steadier pick like this might help cushion the swings of your higher-risk holdings.",
    MIXED: "It sits in the middle of the risk range, which might balance an aggressive risk profile.",
    VOLATILE: "It is on the volatile side, which is what an aggressive risk profile usually accepts.",
  },
  MODERATE: {
    STEADIER: "It is on the steadier side, which might suit a moderate risk profile.",
    MIXED: "Its risk level is mid-range, which could broadly match a moderate risk profile.",
    VOLATILE: "It is more volatile than a moderate profile usually prefers, so it might work better as a small part of a portfolio.",
  },
  CONSERVATIVE: {
    STEADIER: "It is on the steadier side, which might suit your conservative risk profile.",
    MIXED: "It carries more risk than a conservative profile usually prefers, so it could be worth reading up on first.",
    VOLATILE: "It is much more volatile than a conservative profile usually prefers, so treat it as something to research rather than a fit.",
  },
};

const STOCK_HEAVY = 0.7;

function riskSentence(candidate, riskProfile) {
  const byProfile = RISK_SENTENCES[String(riskProfile || "").toUpperCase()];
  return (byProfile && byProfile[candidate.riskClass]) || null;
}

function interestSentence(candidate, matchedIndustry, matchedInstrument) {
  if (matchedIndustry) {
    return `You follow ${matchedIndustry}, and ${candidate.name} is ${candidate.blurb}, so it might be worth a closer look.`;
  }
  if (matchedInstrument) {
    return `You like ${matchedInstrument}, and ${candidate.name} is ${candidate.blurb}, so it could be worth a closer look.`;
  }
  return null;
}

const SPREAD_PHRASES = {
  FUND: "a fund like this",
  BONDS: "a bond holding like this",
  GOLD: "some gold",
  REIT: "some real estate exposure",
};

function diversificationSentence(candidate, held) {
  if (!held || held.count === 0) return null;
  if (!held.groups.has(candidate.assetGroup)) {
    return `You don't hold any ${GROUP_LABELS[candidate.assetGroup] || "of this kind of asset"} yet, so this might add a different kind of exposure.`;
  }
  const spread = SPREAD_PHRASES[candidate.assetGroup];
  if (spread && held.stockShare !== null && held.stockShare >= STOCK_HEAVY) {
    return `Most of your money is in individual stocks, so ${spread} might help spread the risk.`;
  }
  return null;
}

function buildRationale({ candidate, riskProfile = null, held = null, matchedIndustry = null, matchedInstrument = null, hasPreferences = true }) {
  const sentences = [
    riskSentence(candidate, riskProfile),
    interestSentence(candidate, matchedIndustry, matchedInstrument),
    diversificationSentence(candidate, held),
  ].filter(Boolean);
  if (sentences.length === 0) {
    const why = hasPreferences ? "It doesn't match your saved preferences" : "You haven't saved any interests yet";
    return `${candidate.name} is ${candidate.blurb}. ${why}, so treat it as something to research.`;
  }
  return sentences.slice(0, 3).join(" ");
}

module.exports = { buildRationale, summarizeHoldings, heldGroup };
