"use strict";

const {
  MAX_PAISE_10CR,
  RISK_PROFILES,
  STRATEGY_GOALS,
  isPlainObject,
  fail,
  checkPaise,
  checkSafeInt,
  checkString,
  checkBoolean,
  checkEnum,
  checkDate,
  checkDateTime,
  calcAge,
  checkUnknown,
  sanitized,
} = require("./common");

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

module.exports = { validateProfile, checkRiskAnswers, PROFILE_FIELDS };
