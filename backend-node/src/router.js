"use strict";

const { tables } = require("./db");
const { parseBody } = require("./validators/common");
const { validationError, notFound } = require("./utils/response");
const profileRoutes = require("./routes/profileRoutes");
const holdingRoutes = require("./routes/holdingRoutes");
const goalRoutes = require("./routes/goalRoutes");
const loanRoutes = require("./routes/loanRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const portfolioRoutes = require("./routes/portfolioRoutes");

const routes = [...profileRoutes, ...holdingRoutes, ...goalRoutes, ...loanRoutes, ...dashboardRoutes, ...portfolioRoutes];

async function route(event, userId) {
  tables();
  const http = (event && event.requestContext && event.requestContext.http) || {};
  const method = (http.method || event.httpMethod || "").toUpperCase();
  const path = http.path || event.rawPath || event.path || "";

  let body = {};
  if (method === "POST" || method === "PUT") {
    const parsed = parseBody(event);
    if (!parsed.ok) return validationError({ body: "invalid JSON body" });
    body = parsed.body;
  }

  for (const entry of routes) {
    if (entry.method !== method) continue;
    const match = entry.path.exec(path);
    if (!match) continue;
    return entry.controller({ event, userId, body, params: match.slice(1) });
  }

  return notFound(`Unknown route ${method} ${path}`);
}

module.exports = { route };
