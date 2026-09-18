"use strict";

const dashboardController = require("../controllers/dashboardController");

module.exports = [
  { method: "GET", path: /^\/dashboard\/profile$/, controller: dashboardController.getProfile },
  { method: "PUT", path: /^\/dashboard\/financials$/, controller: dashboardController.updateFinancials },
];
