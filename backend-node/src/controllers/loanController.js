"use strict";

const loanModel = require("../models/loanModel");
const { validateLoan, applyLoanDefaults } = require("../validators/loanValidator");
const {
  json,
  validationError,
  notFound,
  noContent,
  isConditionalMiss,
} = require("../utils/response");

async function list({ userId }) {
  return json(200, await loanModel.list(userId));
}

async function create({ userId, body }) {
  const { errors, details, value } = validateLoan(body, { requireCreate: true });
  if (errors.length > 0) return validationError(details);
  return json(201, await loanModel.create(userId, applyLoanDefaults(value)));
}

async function update({ userId, body, params }) {
  const { errors, details, value } = validateLoan(body);
  if (errors.length > 0) return validationError(details);
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
