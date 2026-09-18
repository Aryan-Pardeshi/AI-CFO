"use strict";

const userModel = require("../models/userModel");
const { validateProfile } = require("../validators/profileValidator");
const { json, validationError, notFound } = require("../utils/response");

async function getMe({ userId }) {
  const profile = await userModel.getProfile(userId);
  if (!profile) return notFound("Profile not found");
  return json(200, profile);
}

async function updateProfile({ userId, body }) {
  const { errors, details, value } = validateProfile(body);
  if (errors.length > 0) return validationError(details);
  const profile = await userModel.updateProfile(userId, value);
  return json(200, profile);
}

module.exports = { getMe, updateProfile };
