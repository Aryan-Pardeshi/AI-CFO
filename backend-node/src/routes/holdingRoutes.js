"use strict";

const holdingController = require("../controllers/holdingController");

module.exports = [
  { method: "GET", path: /^\/holdings$/, controller: holdingController.list },
  { method: "POST", path: /^\/holdings$/, controller: holdingController.create },
  {
    method: "PUT",
    path: /^\/holdings\/([^/]+)$/,
    controller: holdingController.update,
  },
  {
    method: "DELETE",
    path: /^\/holdings\/([^/]+)$/,
    controller: holdingController.remove,
  },
];
