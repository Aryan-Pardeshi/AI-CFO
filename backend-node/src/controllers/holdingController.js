"use strict";

const holdingModel = require("../models/holdingModel");
const { validateHolding } = require("../validators/holdingValidator");
const {
  json,
  validationError,
  notFound,
  noContent,
  isConditionalMiss,
} = require("../utils/response");

async function list({ userId }) {
  return json(200, await holdingModel.list(userId));
}

async function create({ userId, body }) {
  const { errors, details, value } = validateHolding(body, { requireCreate: true });
  if (errors.length > 0) return validationError(details);
  return json(201, await holdingModel.create(userId, value));
}

async function update({ userId, body, params }) {
  const { errors, details, value } = validateHolding(body);
  if (errors.length > 0) return validationError(details);
  try {
    return json(200, await holdingModel.update(userId, params[0], value));
  } catch (e) {
    if (isConditionalMiss(e)) return notFound("holding_id not found");
    throw e;
  }
}

async function remove({ userId, params }) {
  try {
    await holdingModel.remove(userId, params[0]);
    return noContent();
  } catch (e) {
    if (isConditionalMiss(e)) return notFound("holding_id not found");
    throw e;
  }
}

module.exports = { list, create, update, remove };
