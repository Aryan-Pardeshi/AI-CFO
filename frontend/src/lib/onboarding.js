import { rupeesToPaise } from './money.js';

// Pure helpers for the onboarding flow: row -> payload mapping and
// create-vs-update-vs-skip decisions. No React, no network — unit tested.

export const MAX_PAISE = 10000000000;

export function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export function parseRupeesField(label, value, { required = true, maxPaise = MAX_PAISE } = {}) {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') {
    if (!required) return { paise: 0, empty: true };
    return { error: `${label} is required` };
  }
  let paise;
  try {
    paise = rupeesToPaise(trimmed);
  } catch {
    return { error: `${label} must be a valid amount with up to 2 decimals` };
  }
  if (paise < 0 || paise > maxPaise) {
    return { error: `${label} must be between ₹0 and ₹10 crore` };
  }
  return { paise };
}

export function serverIdOf(created, fallback) {
  return created?.holding_id ?? created?.loan_id ?? created?.goal_id ?? created?.id ?? fallback;
}

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

export const STEP3_DRAFT_KEY = 'aicfo-onboarding-step3-draft-v1';

const STEP3_INCOME_FIELDS = ['job', 'business', 'rental', 'dividend', 'freelance'];
const STEP3_EXPENSE_FIELDS = ['rent', 'food', 'transportation', 'utilities', 'insurance', 'subscriptions', 'shopping', 'healthcare', 'education', 'entertainment', 'miscellaneous'];
const STEP3_CASH_FIELDS = ['current', 'savings', 'cash'];

function normalizeStep3DraftSection(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const normalized = {};
  for (const field of fields) {
    if (typeof value[field] !== 'string') return null;
    normalized[field] = value[field];
  }
  return normalized;
}

export function serializeStep3Draft({ incomes, expenses, cashParts }) {
  return JSON.stringify({ incomes, expenses, cashParts });
}

export function deserializeStep3Draft(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const incomes = normalizeStep3DraftSection(parsed?.incomes, STEP3_INCOME_FIELDS);
  const expenses = normalizeStep3DraftSection(parsed?.expenses, STEP3_EXPENSE_FIELDS);
  const cashParts = normalizeStep3DraftSection(parsed?.cashParts, STEP3_CASH_FIELDS);
  if (!incomes || !expenses || !cashParts) return null;
  return { incomes, expenses, cashParts };
}

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

export function mapHoldingRows(items) {
  const fd = items.find((h) => h.asset_type === 'FD');
  const rest = items.filter((h) => h.asset_type !== 'FD');
  return {
    fdAmount: fd ? paiseToRupees(fd.fd_principal_paise) : null,
    fdServerId: fd ? fd.holding_id ?? null : null,
    holdings: rest.length > 0 ? rest.map((h) => {
      const valueOnly = h.manual_current_value_paise !== null && h.manual_current_value_paise !== undefined;
      return {
        id: `srv-${h.holding_id}`,
        server_id: h.holding_id,
        asset_type: h.asset_type,
        symbol: h.symbol ?? '',
        name: h.name ?? '',
        quantity: h.quantity === null || h.quantity === undefined ? '' : String(h.quantity),
        buyPrice: paiseToRupees(h.avg_buy_price_paise),
        valueOnly,
        currentValue: valueOnly ? paiseToRupees(h.manual_current_value_paise) : '',
      };
    }) : null,
  };
}

export function isBlankString(value) {
  return String(value ?? '').trim() === '';
}

// A row the user never touched carries no data — safe to skip on submit.
export function holdingRowSync(row) {
  const untouched =
    !row.valueOnly &&
    isBlankString(row.symbol) &&
    isBlankString(row.name) &&
    isBlankString(row.quantity) &&
    isBlankString(row.buyPrice) &&
    isBlankString(row.currentValue);
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

export function buildHoldingPayload({ assetType, symbol, name, quantity, avgBuyPricePaise, manualCurrentValuePaise, source }) {
  const payload = {
    asset_type: assetType,
    symbol,
    name,
    quantity,
    avg_buy_price_paise: avgBuyPricePaise,
  };
  if (manualCurrentValuePaise !== undefined) payload.manual_current_value_paise = manualCurrentValuePaise;
  if (source !== undefined) payload.source = source;
  return payload;
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
    name: 'Fixed deposit',
    fd_principal_paise: paise,
  };
}
