"use strict";

const { tables } = require("../db");
const itemModel = require("./itemModel");

function list(userId) {
  return itemModel.list(tables().goals, userId);
}

function create(userId, value) {
  return itemModel.create(tables().goals, userId, "goal_id", value);
}

function update(userId, id, value) {
  return itemModel.update(tables().goals, userId, "goal_id", id, value);
}

function remove(userId, id) {
  return itemModel.remove(tables().goals, userId, "goal_id", id);
}

module.exports = { list, create, update, remove };
