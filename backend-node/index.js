"use strict";

/**
 * CrudFunction entrypoint.
 * Owns per architecture.md Stack layout: /me, /holdings*, /goals*, /loans*
 * Auth: Cognito sub from JWT authorizer claims. Validation + routes in src/.
 */

const { route } = require("./src/router");

function getAuthenticatedUserId(event) {
  const sub =
    event?.requestContext?.authorizer?.jwt?.claims?.sub;
  if (process.env.AWS_SAM_LOCAL === "true") {
    if (sub) return sub;
    return "local-dev-user";
  }
  if (!sub || typeof sub !== "string") {
    const err = new Error("Missing or invalid Authorization token");
    err.statusCode = 401;
    throw err;
  }
  return sub;
}

const { json } = require("./src/utils/response");

async function handler(event, _context) {
  let userId;
  try {
    userId = getAuthenticatedUserId(event);
  } catch (e) {
    return json(e.statusCode || 401, {
      error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization token" },
    });
  }

  try {
    return await route(event, userId);
  } catch (e) {
    console.error("crud internal error", e);
    return json(500, {
      error: { code: "INTERNAL", message: "Internal server error" },
    });
  }
}

module.exports = { handler, getAuthenticatedUserId };
