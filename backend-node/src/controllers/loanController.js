"use strict";

const loanModel = require("../models/loanModel");
const { validateLoan, applyLoanDefaults } = require("../validators/loanValidator");
const { monthlyEmiPaise } = require("../services/emi");
const {
  json,
  validationError,
  notFound,
  noContent,
  isConditionalMiss,
} = require("../utils/response");

async function list({ userId }) {
  const loans = await loanModel.list(userId);
  // monthly_emi_paise is derived per response from the single tested EMI
  // helper — never stored, never accepted on write (LOAN_FIELDS excludes it).
  return json(
    200,
    loans.map((loan) => ({ ...loan, monthly_emi_paise: monthlyEmiPaise(loan) }))
  );
}

async function create({ userId, body }) {
  const { errors, details, value } = validateLoan(body, { requireCreate: true });
  if (errors.length > 0) return validationError(details);
  return json(201, await loanModel.create(userId, applyLoanDefaults(value)));
}

async function update({ userId, body, params }) {
  // Effective-type gating: card-only fields must not silently persist when the
  // stored loan (or the requested change) is not a credit card.
  let existingType = null;
  const wantsCardField = body && ["issuer", "credit_limit_paise", "payment_due_day"].some(
    (field) => body[field] !== undefined && body[field] !== null,
  );
  const switchingAway = body && body.loan_type !== undefined && body.loan_type !== null && body.loan_type !== "CREDIT_CARD";
  if (body && (body.loan_type === undefined ? wantsCardField : switchingAway)) {
    const current = await loanModel.list(userId);
    const found = Array.isArray(current) ? current.find((item) => item.loan_id === params[0]) : null;
    if (!found) return notFound("loan_id not found");
    existingType = found.loan_type || null;
  }
  const { errors, details, value } = validateLoan(body, { existingLoanType: existingType });
  if (errors.length > 0) return validationError(details);
  // Switching away from CREDIT_CARD must not leave stale card metadata behind.
  // itemModel.update only writes provided keys, so clearing is only possible
  // when the caller explicitly nulls each card field.
  if (value.loan_type && value.loan_type !== "CREDIT_CARD" && existingType === "CREDIT_CARD") {
    value.issuer = null;
    value.credit_limit_paise = null;
    value.payment_due_day = null;
  }
  try {
    return json(200, await loanModel.update(userId, params[0], value));
  } catch (e) {
    if (isConditionalMiss(e)) return notFound("loan_id not found");
    throw e;
  }
}

async function remove({ userId, params }) {
  try {
    await loanModel.remove(userId, params[0]);
    return noContent();
  } catch (e) {
    if (isConditionalMiss(e)) return notFound("loan_id not found");
    throw e;
  }
}

module.exports = { list, create, update, remove };
