"use strict";

const portfolioService = require("../services/portfolioService");
const { json, validationError } = require("../utils/response");

function query(event) {
  return event && event.queryStringParameters && typeof event.queryStringParameters === "object"
    ? event.queryStringParameters
    : {};
}

async function respond(action, args) {
  try {
    return json(200, await action(...args));
  } catch (error) {
    if (error.code === "VALIDATION_ERROR") return validationError(error.details);
    if (error.code === "UPSTREAM_UNAVAILABLE") return json(502, { error: { code: "UPSTREAM_UNAVAILABLE", message: "Market data provider unavailable" } });
    throw error;
  }
}

async function prices({ userId, event }) { return respond(portfolioService.getPrices, [userId, query(event)]); }
async function news({ userId, event }) { return respond(portfolioService.getNews, [userId, query(event)]); }
async function historical({ userId, event }) { return respond(portfolioService.getHistorical, [userId, query(event)]); }
async function suggestions({ userId }) { return respond(portfolioService.getSuggestions, [userId]); }

module.exports = { prices, news, historical, suggestions };
