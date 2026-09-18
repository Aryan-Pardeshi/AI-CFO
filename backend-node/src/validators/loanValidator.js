"use strict";

const {
  LOAN_TYPES,
  RATE_TYPES,
  isPlainObject,
  checkUnknown,
  requireField,
  checkString,
  checkEnum,
  checkPaise,
  checkNumber,
  checkSafeInt,
  checkDate,
  sanitized,
} = require("./common");

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

module.exports = { validateLoan, applyLoanDefaults, LOAN_FIELDS };
