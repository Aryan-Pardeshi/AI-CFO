"use strict";

const profileController = require("../controllers/profileController");

module.exports = [
  { method: "GET", path: /^\/me$/, controller: profileController.getMe },
  { method: "PUT", path: /^\/me\/profile$/, controller: profileController.updateProfile },
];
