"use strict";

const dashboardService = require("../services/dashboardService");
const { validateDashboardFinancials } = require("../validators/dashboardValidator");
const { json, validationError } = require("../utils/response");

async function getProfile({ userId }) {
  return json(200, { user: await dashboardService.getProfile(userId) });
}

async function updateFinancials({ userId, body }) {
  const keys = Object.keys(body || {});
  if (keys.length !== 1 || keys[0] !== "financials") return validationError({ body: "must contain only financials" });
  const validation = validateDashboardFinancials(body.financials);
  if (validation.errors.length > 0) return validationError(validation.details);
  try {
    return json(200, { user: await dashboardService.saveFinancials(userId, validation.value) });
  } catch (error) {
    if (error.code === "VALIDATION_ERROR") return validationError(error.details);
    throw error;
  }
}

module.exports = { getProfile, updateFinancials };
