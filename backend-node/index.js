"use strict";

/**
 * CrudFunction entrypoint — hour 0-3 stub.
 * Owns per architecture.md Stack layout: /me, /holdings*, /goals*, /loans*
 * No business logic yet. Every known route returns 501.
 * Auth plumbing real: Cognito sub from JWT authorizer claims.
 */

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

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function notImplemented(route) {
  return json(501, {
    error: { code: "NOT_IMPLEMENTED", message: `${route} not implemented yet (hour 0-3 stub)` },
  });
}

const ROUTES = [
  ["GET", /^\/me$/],
  ["PUT", /^\/me\/profile$/],
  ["GET", /^\/holdings$/],
  ["POST", /^\/holdings$/],
  ["PUT", /^\/holdings\/[^/]+$/],
  ["DELETE", /^\/holdings\/[^/]+$/],
  ["GET", /^\/goals$/],
  ["POST", /^\/goals$/],
  ["PUT", /^\/goals\/[^/]+$/],
  ["DELETE", /^\/goals\/[^/]+$/],
  ["GET", /^\/loans$/],
  ["POST", /^\/loans$/],
  ["PUT", /^\/loans\/[^/]+$/],
  ["DELETE", /^\/loans\/[^/]+$/],
];

function methodAndPath(event) {
  const http = (event && event.requestContext && event.requestContext.http) || {};
  const method = (http.method || event.httpMethod || "").toUpperCase();
  const path = http.path || event.rawPath || event.path || "";
  return [method, path];
}

async function handler(event, _context) {
  try {
    getAuthenticatedUserId(event);
  } catch (e) {
    return json(e.statusCode || 401, {
      error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization token" },
    });
  }

  const [method, path] = methodAndPath(event);
  const label = `${method} ${path}`;
  for (const [rm, pattern] of ROUTES) {
    if (method === rm && pattern.test(path)) return notImplemented(label);
  }
  return json(404, { error: { code: "NOT_FOUND", message: `Unknown route ${label}` } });
}

module.exports = { handler, getAuthenticatedUserId };
