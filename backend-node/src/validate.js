"use strict";

/**
 * Field validation for CrudFunction.
 * Mirrors contracts/openapi.yaml enums + .agents/modules.md "Validation bounds".
 * Every *_paise field must be a non-negative safe integer (rejects floats/strings).
 */

const MAX_PAISE_10CR = 10000000000;

const ASSET_TYPES = ["STOCK", "ETF", "MUTUAL_FUND", "FD", "CASH", "CRYPTO", "OTHER"];
const HOLDING_SOURCES = ["UPSTOX", "MANUAL", "DEMO", "IMPORTED"];
const RISK_PROFILES = ["CONSERVATIVE", "MODERATE", "AGGRESSIVE"];
const STRATEGY_GOALS = ["WEALTH_GROWTH", "INCOME", "CAPITAL_PRESERVATION", "FIRE"];
const GOAL_TYPES = ["CAR", "WEDDING", "HOUSE_DOWN_PAYMENT", "EDUCATION", "TRAVEL", "OTHER"];
const LOAN_TYPES = ["HOME", "CAR", "PERSONAL", "EDUCATION", "CREDIT_CARD", "OTHER"];
const RATE_TYPES = ["FLOATING", "FIXED"];
const FD_TYPES = ["CUMULATIVE", "PAYOUT"];

// Client-supplied ids are ignored, never written. Stripped before unknown-field checks.
const IGNORED_ID_FIELDS = new Set(["user_id", "holding_id", "goal_id", "loan_id"]);

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function fail(errors, details, field, msg) {
  errors.push(field);
  details[field] = msg;
}

function checkPaise(value, field, errors, details, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, "must be a non-negative integer (paise), not null");
    return;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(errors, details, field, "must be a non-negative safe integer (paise)");
    return;
  }
  if (opts.max !== undefined && value > opts.max) {
    fail(errors, details, field, `must be <= ${opts.max}`);
  }
  if (opts.min !== undefined && value < opts.min) {
    fail(errors, details, field, `must be >= ${opts.min}`);
  }
}

function checkSafeInt(value, field, errors, details, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, "must be an integer, not null");
    return;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    fail(errors, details, field, "must be an integer");
    return;
  }
  if (opts.max !== undefined && value > opts.max) {
    fail(errors, details, field, `must be <= ${opts.max}`);
  }
  if (opts.min !== undefined && value < opts.min) {
    fail(errors, details, field, `must be >= ${opts.min}`);
  }
}

function checkNumber(value, field, errors, details, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, "must be a number, not null");
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(errors, details, field, "must be a number");
    return;
  }
  if (opts.max !== undefined && value > opts.max) {
    fail(errors, details, field, `must be <= ${opts.max}`);
  }
  if (opts.min !== undefined && value < opts.min) {
    fail(errors, details, field, `must be >= ${opts.min}`);
  }
}

function checkString(value, field, errors, details, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, "must be a string, not null");
    return;
  }
  if (typeof value !== "string") {
    fail(errors, details, field, "must be a string");
    return;
  }
  if (opts.max !== undefined && value.length > opts.max) {
    fail(errors, details, field, `must be <= ${opts.max} characters`);
  }
  if (opts.minLength !== undefined && value.length < opts.minLength) {
    fail(errors, details, field, `must be >= ${opts.minLength} characters`);
  }
}

function requireField(body, field, errors, details) {
  const v = body[field];
  if (v === undefined || v === null || (typeof v === "string" && v === "")) {
    fail(errors, details, field, "required");
    return false;
  }
  return true;
}

function checkBoolean(value, field, errors, details) {
  if (value === undefined || value === null) {
    if (value === null) fail(errors, details, field, "must be a boolean, not null");
    return;
  }
  if (typeof value !== "boolean") fail(errors, details, field, "must be a boolean");
}

function checkEnum(value, field, errors, details, allowed, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, `must be one of ${allowed.join("|")}`);
    return;
  }
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(errors, details, field, `must be one of ${allowed.join("|")}`);
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function checkDate(value, field, errors, details, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, "must be a YYYY-MM-DD date, not null");
    return;
  }
  if (typeof value !== "string") {
    fail(errors, details, field, "must be a YYYY-MM-DD date");
    return;
  }
  const m = DATE_RE.exec(value);
  if (!m) {
    fail(errors, details, field, "must be a YYYY-MM-DD date");
    return;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    fail(errors, details, field, "must be a valid calendar date (YYYY-MM-DD)");
  }
}

function checkDateTime(value, field, errors, details) {
  if (value === undefined || value === null) return; // nullable
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    fail(errors, details, field, "must be an ISO 8601 date-time string");
  }
}

function calcAge(dobStr, now = new Date()) {
  const parts = dobStr.split("-").map(Number);
  let age = now.getUTCFullYear() - parts[0];
  const mm = now.getUTCMonth() + 1;
  const dd = now.getUTCDate();
  if (mm < parts[1] || (mm === parts[1] && dd < parts[2])) age -= 1;
  return age;
}

function checkUnknown(body, allowed, errors, details) {
  for (const key of Object.keys(body)) {
    if (IGNORED_ID_FIELDS.has(key)) continue;
    if (!allowed.has(key)) {
      fail(errors, details, key, "unknown field");
    }
  }
}

function sanitized(body, allowed) {
  const out = {};
  for (const key of Object.keys(body)) {
    if (IGNORED_ID_FIELDS.has(key)) continue;
    if (allowed.has(key) && body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

// ---- UserProfile (PUT /me/profile is a partial update) ----

const PROFILE_FIELDS = new Set([
  "name",
  "date_of_birth",
  "base_currency",
  "monthly_income_paise",
  "monthly_expenses_paise",
  "monthly_investment_paise",
  "declared_net_worth_paise",
  "cash_balance_paise",
  "emergency_fund_target_months",
  "risk_profile",
  "risk_score",
  "risk_answers",
  "consent_accepted_at",
  "investment_horizon_years",
  "strategy_goal",
  "dependents_count",
  "existing_term_cover_paise",
  "existing_health_cover_paise",
  "employment_type",
  "city_tier",
  "onboarding_step",
  "onboarded",
]);

function checkRiskAnswers(value, errors, details) {
  if (value === undefined || value === null) return; // nullable
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= 3)
  ) {
    fail(errors, details, "risk_answers", "must be an array of exactly 4 integers, each 1..3");
  }
}

function validateProfile(body) {
  const errors = [];
  const details = {};
  if (!isPlainObject(body)) {
    return { errors: ["body"], details: { body: "must be a JSON object" }, value: null };
  }
  checkUnknown(body, PROFILE_FIELDS, errors, details);

  checkString(body.name, "name", errors, details, { max: 200 });
  checkDate(body.date_of_birth, "date_of_birth", errors, details);
  checkString(body.base_currency, "base_currency", errors, details);
  checkPaise(body.monthly_income_paise, "monthly_income_paise", errors, details, {
    nullable: true,
    max: MAX_PAISE_10CR,
  });
  checkPaise(body.monthly_expenses_paise, "monthly_expenses_paise", errors, details, {
    max: MAX_PAISE_10CR,
  });
  checkPaise(body.monthly_investment_paise, "monthly_investment_paise", errors, details, {
    max: MAX_PAISE_10CR,
  });
  checkPaise(body.declared_net_worth_paise, "declared_net_worth_paise", errors, details, {
    nullable: true,
  });
  checkPaise(body.cash_balance_paise, "cash_balance_paise", errors, details);
  checkSafeInt(body.emergency_fund_target_months, "emergency_fund_target_months", errors, details, {
    min: 0,
    max: 24,
  });
  checkEnum(body.risk_profile, "risk_profile", errors, details, RISK_PROFILES);
  checkSafeInt(body.risk_score, "risk_score", errors, details, { min: 4, max: 12 });
  checkRiskAnswers(body.risk_answers, errors, details);
  // risk consistency: when both present, risk_score must equal sum of risk_answers.
  if (
    body.risk_answers !== undefined &&
    body.risk_score !== undefined &&
    body.risk_answers !== null &&
    body.risk_score !== null &&
    !details.risk_answers &&
    !details.risk_score &&
    Array.isArray(body.risk_answers)
  ) {
    const sum = body.risk_answers.reduce((a, b) => a + b, 0);
    if (sum !== body.risk_score) {
      fail(errors, details, "risk_score", "must equal the sum of risk_answers");
    }
  }
  checkDateTime(body.consent_accepted_at, "consent_accepted_at", errors, details);
  checkSafeInt(body.investment_horizon_years, "investment_horizon_years", errors, details, {
    min: 0,
    max: 60,
  });
  checkEnum(body.strategy_goal, "strategy_goal", errors, details, STRATEGY_GOALS);
  checkSafeInt(body.dependents_count, "dependents_count", errors, details, {
    nullable: true,
    min: 0,
    max: 20,
  });
  checkPaise(body.existing_term_cover_paise, "existing_term_cover_paise", errors, details, {
    nullable: true,
  });
  checkPaise(body.existing_health_cover_paise, "existing_health_cover_paise", errors, details, {
    nullable: true,
  });
  checkString(body.employment_type, "employment_type", errors, details, { nullable: true });
  checkString(body.city_tier, "city_tier", errors, details, { nullable: true });
  checkSafeInt(body.onboarding_step, "onboarding_step", errors, details, { min: 0, max: 8 });
  checkBoolean(body.onboarded, "onboarded", errors, details);

  // date_of_birth must give age 18..80.
  if (body.date_of_birth !== undefined && body.date_of_birth !== null && !details.date_of_birth) {
    const age = calcAge(body.date_of_birth);
    if (age < 18 || age > 80) {
      fail(errors, details, "date_of_birth", "age must be 18..80");
    }
  }

  return { errors, details, value: sanitized(body, PROFILE_FIELDS) };
}

// ---- Holding ----

const HOLDING_FIELDS = new Set([
  "asset_type",
  "source",
  "instrument_key",
  "symbol",
  "isin",
  "name",
  "quantity",
  "avg_buy_price_paise",
  "first_buy_date",
  "manual_current_value_paise",
  "sector",
  "sip_monthly_paise",
  "fd_type",
  "fd_principal_paise",
  "fd_annual_rate",
  "fd_start_date",
  "fd_maturity_date",
]);

const QUANTITY_REQUIRED_TYPES = new Set(["STOCK", "ETF", "MUTUAL_FUND", "CRYPTO"]);

function validateHolding(body, opts = {}) {
  const errors = [];
  const details = {};
  if (!isPlainObject(body)) {
    return { errors: ["body"], details: { body: "must be a JSON object" }, value: null };
  }
  checkUnknown(body, HOLDING_FIELDS, errors, details);

  if (opts.requireCreate) {
    requireField(body, "asset_type", errors, details);
    requireField(body, "name", errors, details);
    if (body.asset_type === "FD") {
      requireField(body, "fd_principal_paise", errors, details);
    } else if (QUANTITY_REQUIRED_TYPES.has(body.asset_type)) {
      requireField(body, "quantity", errors, details);
    }
  }

  checkEnum(body.asset_type, "asset_type", errors, details, ASSET_TYPES);
  checkEnum(body.source, "source", errors, details, HOLDING_SOURCES);
  checkString(body.instrument_key, "instrument_key", errors, details, {
    nullable: true,
    max: 100,
  });
  checkString(body.symbol, "symbol", errors, details, { nullable: true, max: 100 });
  checkString(body.isin, "isin", errors, details, { nullable: true, max: 100 });
  checkString(body.name, "name", errors, details, { max: 200 });
  checkNumber(body.quantity, "quantity", errors, details, { nullable: true });
  if (
    body.quantity !== undefined &&
    body.quantity !== null &&
    !details.quantity &&
    typeof body.quantity === "number" &&
    body.quantity <= 0
  ) {
    fail(errors, details, "quantity", "must be > 0");
  }
  checkPaise(body.avg_buy_price_paise, "avg_buy_price_paise", errors, details, { nullable: true });
  checkDate(body.first_buy_date, "first_buy_date", errors, details, { nullable: true });
  checkPaise(body.manual_current_value_paise, "manual_current_value_paise", errors, details, {
    nullable: true,
  });
  checkString(body.sector, "sector", errors, details, { nullable: true, max: 100 });
  checkPaise(body.sip_monthly_paise, "sip_monthly_paise", errors, details, { nullable: true });
  checkEnum(body.fd_type, "fd_type", errors, details, FD_TYPES, { nullable: true });
  checkPaise(body.fd_principal_paise, "fd_principal_paise", errors, details, { nullable: true });
  checkNumber(body.fd_annual_rate, "fd_annual_rate", errors, details, {
    nullable: true,
    min: 0,
    max: 0.36,
  });
  checkDate(body.fd_start_date, "fd_start_date", errors, details, { nullable: true });
  checkDate(body.fd_maturity_date, "fd_maturity_date", errors, details, { nullable: true });

  const value = sanitized(body, HOLDING_FIELDS);
  if (opts.requireCreate && value.source === undefined) value.source = "MANUAL";
  return { errors, details, value };
}

// ---- Goal ----

const GOAL_FIELDS = new Set([
  "name",
  "goal_type",
  "amount_today_paise",
  "target_age",
  "inflation_rate",
  "priority",
]);

function validateGoal(body, userDobStr, opts = {}) {
  const errors = [];
  const details = {};
  if (!isPlainObject(body)) {
    return { errors: ["body"], details: { body: "must be a JSON object" }, value: null };
  }
  // Allow validateGoal(body, { requireCreate: true }) without dob.
  if (userDobStr !== null && userDobStr !== undefined && typeof userDobStr === "object") {
    opts = userDobStr;
    userDobStr = null;
  }
  checkUnknown(body, GOAL_FIELDS, errors, details);

  if (opts.requireCreate) {
    requireField(body, "name", errors, details);
    requireField(body, "goal_type", errors, details);
    requireField(body, "amount_today_paise", errors, details);
    requireField(body, "target_age", errors, details);
  }

  checkString(body.name, "name", errors, details, { max: 200 });
  checkEnum(body.goal_type, "goal_type", errors, details, GOAL_TYPES);
  checkPaise(body.amount_today_paise, "amount_today_paise", errors, details);
  checkSafeInt(body.target_age, "target_age", errors, details);
  checkNumber(body.inflation_rate, "inflation_rate", errors, details);
  checkSafeInt(body.priority, "priority", errors, details, { nullable: true });

  // target_age: current age+1..91 when dob known, else 1..91.
  if (body.target_age !== undefined && body.target_age !== null && !details.target_age) {
    let min = 1;
    if (userDobStr) min = calcAge(userDobStr) + 1;
    if (body.target_age < min || body.target_age > 91) {
      fail(errors, details, "target_age", `must be ${min}..91`);
    }
  }

  const value = sanitized(body, GOAL_FIELDS);
  return { errors, details, value };
}

function applyGoalDefaults(value) {
  if (value.inflation_rate === undefined) {
    value.inflation_rate = value.goal_type === "EDUCATION" ? 0.1 : 0.06;
  }
  return value;
}

// ---- Loan ----

const LOAN_FIELDS = new Set([
  "name",
  "loan_type",
  "principal_paise",
  "outstanding_paise",
  "annual_rate",
  "tenure_months",
  "start_date",
  "rate_type",
  "prepayment_charge_pct",
]);

function validateLoan(body, opts = {}) {
  const errors = [];
  const details = {};
  if (!isPlainObject(body)) {
    return { errors: ["body"], details: { body: "must be a JSON object" }, value: null };
  }
  checkUnknown(body, LOAN_FIELDS, errors, details);

  if (opts.requireCreate) {
    requireField(body, "name", errors, details);
    requireField(body, "loan_type", errors, details);
    requireField(body, "outstanding_paise", errors, details);
    requireField(body, "annual_rate", errors, details);
    requireField(body, "tenure_months", errors, details);
  }

  checkString(body.name, "name", errors, details, { max: 200 });
  checkEnum(body.loan_type, "loan_type", errors, details, LOAN_TYPES);
  checkPaise(body.principal_paise, "principal_paise", errors, details);
  checkPaise(body.outstanding_paise, "outstanding_paise", errors, details);
  checkNumber(body.annual_rate, "annual_rate", errors, details, { min: 0, max: 0.36 });
  checkSafeInt(body.tenure_months, "tenure_months", errors, details, { min: 1, max: 480 });
  checkDate(body.start_date, "start_date", errors, details);
  checkEnum(body.rate_type, "rate_type", errors, details, RATE_TYPES);
  checkNumber(body.prepayment_charge_pct, "prepayment_charge_pct", errors, details, {
    min: 0,
    max: 100,
  });

  const value = sanitized(body, LOAN_FIELDS);
  return { errors, details, value };
}

function applyLoanDefaults(value) {
  if (value.prepayment_charge_pct === undefined) value.prepayment_charge_pct = 0;
  return value;
}

function parseBody(event) {
  let raw = event.body;
  if (raw === undefined || raw === null || raw === "") return { ok: true, body: {} };
  if (typeof raw === "object" && !Array.isArray(raw)) return { ok: true, body: raw };
  if (typeof raw !== "string") return { ok: false, body: null };
  try {
    if (event.isBase64Encoded) {
      raw = Buffer.from(raw, "base64").toString("utf8");
    }
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return { ok: false, body: null };
    return { ok: true, body: parsed };
  } catch {
    return { ok: false, body: null };
  }
}

module.exports = {
  MAX_PAISE_10CR,
  ASSET_TYPES,
  HOLDING_SOURCES,
  RISK_PROFILES,
  STRATEGY_GOALS,
  GOAL_TYPES,
  LOAN_TYPES,
  RATE_TYPES,
  FD_TYPES,
  calcAge,
  parseBody,
  validateProfile,
  validateHolding,
  validateGoal,
  applyGoalDefaults,
  validateLoan,
  applyLoanDefaults,
};
