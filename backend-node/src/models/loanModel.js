"use strict";

const { tables } = require("../db");
const itemModel = require("./itemModel");

function list(userId) {
  return itemModel.list(tables().loans, userId);
}

function create(userId, value) {
  return itemModel.create(tables().loans, userId, "loan_id", value);
}

function update(userId, id, value) {
  return itemModel.update(tables().loans, userId, "loan_id", id, value);
}

function remove(userId, id) {
  return itemModel.remove(tables().loans, userId, "loan_id", id);
}

module.exports = { list, create, update, remove };
