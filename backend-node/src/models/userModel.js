"use strict";

const { GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { getDocClient, tables } = require("../db");

function nowIso() {
  return new Date().toISOString();
}

async function getProfile(userId) {
  const doc = getDocClient();
  const res = await doc.send(
    new GetCommand({ TableName: tables().users, Key: { user_id: userId } })
  );
  return res && res.Item;
}

async function updateProfile(userId, value) {
  const doc = getDocClient();
  const now = nowIso();
  const names = {};
  const values = { ":now": now };
  const sets = [];
  let i = 0;
  for (const [k, v] of Object.entries(value)) {
    names[`#f${i}`] = k;
    values[`:v${i}`] = v;
    sets.push(`#f${i} = :v${i}`);
    i += 1;
  }
  names["#updated_at"] = "updated_at";
  names["#created_at"] = "created_at";
  sets.push("#updated_at = :now");
  sets.push("#created_at = if_not_exists(#created_at, :now)");
  const res = await doc.send(
    new UpdateCommand({
      TableName: tables().users,
      Key: { user_id: userId },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    })
  );
  return (res && res.Attributes) || {};
}

async function getDateOfBirth(userId) {
  const doc = getDocClient();
  const res = await doc.send(
    new GetCommand({ TableName: tables().users, Key: { user_id: userId } })
  );
  const dob = res && res.Item && res.Item.date_of_birth;
  return typeof dob === "string" ? dob : null;
}

module.exports = { getProfile, updateProfile, getDateOfBirth };
