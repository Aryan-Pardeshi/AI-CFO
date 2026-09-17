"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

let cached = null;

function getDocClient() {
  if (!cached) {
    cached = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }
  return cached;
}

function tables() {
  return {
    users: process.env.USERS_TABLE,
    holdings: process.env.HOLDINGS_TABLE,
    goals: process.env.GOALS_TABLE,
    loans: process.env.LOANS_TABLE,
  };
}

// Test hook: swap the shared client (unit tests use aws-sdk-client-mock instead).
function _setDocClient(client) {
  cached = client;
}

module.exports = { getDocClient, tables, _setDocClient };
