"use strict";

const goalModel = require("../models/goalModel");
const userModel = require("../models/userModel");
const { validateGoal, applyGoalDefaults } = require("../validators/goalValidator");
const {
  json,
  validationError,
  notFound,
  noContent,
  isConditionalMiss,
} = require("../utils/response");

async function list({ userId }) {
  return json(200, await goalModel.list(userId));
}

async function create({ userId, body }) {
  const dob = await userModel.getDateOfBirth(userId);
  const { errors, details, value } = validateGoal(body, dob, { requireCreate: true });
  if (errors.length > 0) return validationError(details);
  return json(201, await goalModel.create(userId, applyGoalDefaults(value)));
}

async function update({ userId, body, params }) {
  const dob = await userModel.getDateOfBirth(userId);
  const { errors, details, value } = validateGoal(body, dob);
  if (errors.length > 0) return validationError(details);
  try {
    return json(200, await goalModel.update(userId, params[0], value));
  } catch (e) {
    if (isConditionalMiss(e)) return notFound("goal_id not found");
    throw e;
  }
}

async function remove({ userId, params }) {
  try {
    await goalModel.remove(userId, params[0]);
    return noContent();
  } catch (e) {
    if (isConditionalMiss(e)) return notFound("goal_id not found");
    throw e;
  }
}

module.exports = { list, create, update, remove };
