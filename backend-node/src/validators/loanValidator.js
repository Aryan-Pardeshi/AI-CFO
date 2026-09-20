"use strict";

const {
  LOAN_TYPES,
  RATE_TYPES,
  MAX_PAISE_10CR,
  isPlainObject,
  checkUnknown,
  requireField,
  fail,
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
  "issuer",
  "credit_limit_paise",
  "payment_due_day",
]);

const CARD_FIELDS = ["issuer", "credit_limit_paise", "payment_due_day"];

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

  // Card metadata is optional and only meaningful for CREDIT_CARD loans.
  // Trim issuer now so storage never keeps padding; null clears it on update.
  // Trimmed value is tracked locally (never written back onto the caller's
  // `body`) and spliced into `value` after `sanitized()` below, so validation
  // never mutates the request object it was handed.
  let trimmedIssuer;
  let issuerTrimmed = false;
  if (body.issuer !== undefined && body.issuer !== null) {
    if (typeof body.issuer !== "string") {
      fail(errors, details, "issuer", "must be a string");
    } else {
      const trimmed = body.issuer.trim();
      if (trimmed === "") {
        fail(errors, details, "issuer", "must not be blank");
      } else if (trimmed.length > 120) {
        fail(errors, details, "issuer", "must be <= 120 characters");
      } else {
        trimmedIssuer = trimmed;
        issuerTrimmed = true;
      }
    }
  }
  checkPaise(body.credit_limit_paise, "credit_limit_paise", errors, details, {
    nullable: true,
    max: MAX_PAISE_10CR,
  });
  checkSafeInt(body.payment_due_day, "payment_due_day", errors, details, { min: 1, max: 31, nullable: true });

  // Gate card-only fields by effective loan type. On update without loan_type,
  // only reject card fields that are actually being set (not cleared with null).
  if (body.loan_type !== undefined && body.loan_type !== null && !details.loan_type) {
    if (body.loan_type !== "CREDIT_CARD") {
      for (const field of CARD_FIELDS) {
        if (body[field] !== undefined && body[field] !== null) {
          fail(errors, details, field, "only CREDIT_CARD loans may set this field");
        }
      }
    }
  } else if (body.loan_type === undefined && opts.existingLoanType && opts.existingLoanType !== "CREDIT_CARD") {
    for (const field of CARD_FIELDS) {
      if (body[field] !== undefined && body[field] !== null) {
        fail(errors, details, field, "only CREDIT_CARD loans may set this field");
      }
    }
  }

  const value = sanitized(body, LOAN_FIELDS);
  if (issuerTrimmed) value.issuer = trimmedIssuer;
  return { errors, details, value };
}

function applyLoanDefaults(value) {
  if (value.prepayment_charge_pct === undefined) value.prepayment_charge_pct = 0;
  return value;
}

module.exports = { validateLoan, applyLoanDefaults, LOAN_FIELDS };
