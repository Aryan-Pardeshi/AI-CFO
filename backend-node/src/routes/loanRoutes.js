"use strict";

const loanController = require("../controllers/loanController");

module.exports = [
  { method: "GET", path: /^\/loans$/, controller: loanController.list },
  { method: "POST", path: /^\/loans$/, controller: loanController.create },
  {
    method: "PUT",
    path: /^\/loans\/([^/]+)$/,
    controller: loanController.update,
  },
  {
    method: "DELETE",
    path: /^\/loans\/([^/]+)$/,
    controller: loanController.remove,
  },
];
