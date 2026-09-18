"use strict";

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function validationError(details) {
  return json(400, {
    error: { code: "VALIDATION_ERROR", message: "Request validation failed", details },
  });
}

function notFound(message) {
  return json(404, { error: { code: "NOT_FOUND", message } });
}

function noContent() {
  return { statusCode: 204, headers: {}, body: "" };
}

function isConditionalMiss(e) {
  return !!e && e.name === "ConditionalCheckFailedException";
}

module.exports = { json, validationError, notFound, noContent, isConditionalMiss };
