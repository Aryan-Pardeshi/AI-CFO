"use strict";

const portfolioController = require("../controllers/portfolioController");

module.exports = [
  { method: "GET", path: /^\/portfolio\/prices$/, controller: portfolioController.prices },
  { method: "GET", path: /^\/portfolio\/news$/, controller: portfolioController.news },
  { method: "GET", path: /^\/portfolio\/historical$/, controller: portfolioController.historical },
  { method: "GET", path: /^\/portfolio\/suggestions$/, controller: portfolioController.suggestions },
];
