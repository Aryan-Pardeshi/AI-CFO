"use strict";

const { tables } = require("../db");
const itemModel = require("./itemModel");

function list(userId) {
  return itemModel.list(tables().holdings, userId);
}

function create(userId, value) {
  return itemModel.create(tables().holdings, userId, "holding_id", value);
}

function update(userId, id, value) {
  return itemModel.update(tables().holdings, userId, "holding_id", id, value);
}

function remove(userId, id) {
  return itemModel.remove(tables().holdings, userId, "holding_id", id);
}

module.exports = { list, create, update, remove };
