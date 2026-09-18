"use strict";

const { randomUUID } = require("node:crypto");
const {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { getDocClient } = require("../db");

function nowIso() {
  return new Date().toISOString();
}

async function list(tableName, userId) {
  const doc = getDocClient();
  const res = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "user_id = :u",
      ExpressionAttributeValues: { ":u": userId },
    })
  );
  // List shape follows contracts/openapi.yaml: a bare JSON array.
  return res.Items || [];
}

async function create(tableName, userId, idField, value) {
  const now = nowIso();
  const item = {
    ...value,
    user_id: userId,
    [idField]: randomUUID(),
    created_at: now,
    updated_at: now,
  };
  const doc = getDocClient();
  await doc.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

async function update(tableName, userId, idField, id, value) {
  const names = {};
  const values = {};
  const sets = [];
  let i = 0;
  for (const [k, v] of Object.entries(value)) {
    names[`#f${i}`] = k;
    values[`:v${i}`] = v;
    sets.push(`#f${i} = :v${i}`);
    i += 1;
  }
  const now = nowIso();
  names["#updated_at"] = "updated_at";
  values[":updated_at"] = now;
  sets.push("#updated_at = :updated_at");
  const doc = getDocClient();
  const res = await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { user_id: userId, [idField]: id },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: `attribute_exists(${idField})`,
      ReturnValues: "ALL_NEW",
    })
  );
  return res.Attributes || {};
}

async function remove(tableName, userId, idField, id) {
  const doc = getDocClient();
  await doc.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { user_id: userId, [idField]: id },
      ConditionExpression: `attribute_exists(${idField})`,
    })
  );
}

module.exports = { list, create, update, remove };
