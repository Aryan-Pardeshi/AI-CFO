// Pure helpers for the onboarding flow: row -> payload mapping and
// create-vs-update-vs-skip decisions. No React, no network — unit tested.

export const GOAL_TYPE_LABELS = {
  CAR: 'Car',
  WEDDING: 'Wedding',
  HOUSE_DOWN_PAYMENT: 'House down payment',
  EDUCATION: 'Education',
  TRAVEL: 'Travel',
  OTHER: 'Other',
};

export const RISK_PROFILE_LABELS = {
  CONSERVATIVE: 'Conservative',
  MODERATE: 'Moderate',
  AGGRESSIVE: 'Aggressive',
};

export const STRATEGY_GOAL_LABELS = {
  WEALTH_GROWTH: 'Wealth growth',
  INCOME: 'Regular income',
  CAPITAL_PRESERVATION: 'Capital preservation',
  FIRE: 'FIRE — financial independence',
};

export const LOAN_TYPE_LABELS = {
  HOME: 'Home',
  CAR: 'Car',
  PERSONAL: 'Personal',
  EDUCATION: 'Education',
  CREDIT_CARD: 'Credit card',
  OTHER: 'Other',
};

export const RATE_TYPE_LABELS = {
  FLOATING: 'Floating',
  FIXED: 'Fixed',
};

export const ASSET_TYPE_LABELS = {
  STOCK: 'Stock',
  ETF: 'ETF',
  MUTUAL_FUND: 'Mutual fund',
  CRYPTO: 'Crypto',
  OTHER: 'Other',
};

// Percent shown in inputs <-> decimal fraction sent to API.
// percentToFraction(8.5) -> 0.085 ; fractionToPercent(0.1) -> 10
export function percentToFraction(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 10000) / 1000000;
}

export function fractionToPercent(fraction) {
  const n = Number(fraction);
  if (!Number.isFinite(n)) return '';
  const percent = n * 100;
  return Math.round(percent * 10000) / 10000;
}

export function goalDefaultName(goalType) {
  return GOAL_TYPE_LABELS[goalType] ?? 'Other';
}

// Server paise (integer) -> rupee string for form fields. '' when absent.
export function paiseToRupees(paise) {
  if (paise === null || paise === undefined || paise === '') return '';
  const n = Number(paise);
  if (!Number.isFinite(n)) return '';
  return String(n / 100);
}

export function isBlankString(value) {
  return String(value ?? '').trim() === '';
}

// A row the user never touched carries no data — safe to skip on submit.
export function holdingRowSync(row) {
  const untouched =
    isBlankString(row.symbol) &&
    isBlankString(row.name) &&
    isBlankString(row.quantity) &&
    isBlankString(row.buyPrice);
  if (untouched) return 'skip';
  return row.server_id ? 'update' : 'create';
}

export function loanRowSync(row) {
  const untouched =
    isBlankString(row.name) &&
    isBlankString(row.principal) &&
    isBlankString(row.outstanding);
  if (untouched) return 'skip';
  return row.server_id ? 'update' : 'create';
}

// Goal rows get a default name from their type, so "untouched" is judged on
// the numeric fields — otherwise every fresh row would demand an amount.
export function goalRowSync(row) {
  const untouched = isBlankString(row.amount) && isBlankString(row.target_age);
  if (untouched) return 'skip';
  return row.server_id ? 'update' : 'create';
}

// Fixed-deposit field <-> the single FD holding. Clearing the field deletes
// the holding; changing it updates in place; first entry creates it once.
export function fdHoldingSync({ serverId, paise }) {
  const hasAmount = Number.isInteger(paise) && paise > 0;
  if (hasAmount) return serverId ? 'update' : 'create';
  return serverId ? 'delete' : 'skip';
}

export function buildHoldingPayload({ assetType, symbol, name, quantity, avgBuyPricePaise }) {
  return {
    asset_type: assetType,
    source: 'MANUAL',
    symbol,
    name,
    quantity,
    avg_buy_price_paise: avgBuyPricePaise,
  };
}

export function buildLoanPayload({ loanType, name, principalPaise, outstandingPaise, annualRate, tenureMonths, startDate, rateType }) {
  return {
    loan_type: loanType,
    name,
    principal_paise: principalPaise,
    outstanding_paise: outstandingPaise,
    annual_rate: annualRate,
    tenure_months: tenureMonths,
    start_date: startDate,
    rate_type: rateType,
  };
}

export function buildGoalPayload({ name, goalType, amountPaise, targetAge, inflationRate }) {
  return {
    name,
    goal_type: goalType,
    amount_today_paise: amountPaise,
    target_age: targetAge,
    inflation_rate: inflationRate,
  };
}

export function buildFdPayload(paise) {
  return {
    asset_type: 'FD',
    source: 'MANUAL',
    name: 'Fixed deposit',
    fd_principal_paise: paise,
  };
}
