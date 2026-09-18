"use strict";

const goalController = require("../controllers/goalController");

module.exports = [
  { method: "GET", path: /^\/goals$/, controller: goalController.list },
  { method: "POST", path: /^\/goals$/, controller: goalController.create },
  {
    method: "PUT",
    path: /^\/goals\/([^/]+)$/,
    controller: goalController.update,
  },
  {
    method: "DELETE",
    path: /^\/goals\/([^/]+)$/,
    controller: goalController.remove,
  },
];
