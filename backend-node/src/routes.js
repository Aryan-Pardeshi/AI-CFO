"use strict";

const { randomUUID } = require("node:crypto");
const {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { getDocClient, tables } = require("./db");
const {
  parseBody,
  validateProfile,
  validateHolding,
  validateGoal,
  applyGoalDefaults,
  validateLoan,
  applyLoanDefaults,
} = require("./validate");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function validationError(details) {
  return json(400, {
    error: { code: "VALIDATION_ERROR", message: "Request validation failed", details },
  });
}

function notFound(message) {
  return json(404, { error: { code: "NOT_FOUND", message } });
}

function isConditionalMiss(e) {
  return !!e && e.name === "ConditionalCheckFailedException";
}

function nowIso() {
  return new Date().toISOString();
}

// ---- /me ----

async function handleGetMe(userId) {
  const doc = getDocClient();
  const res = await doc.send(
    new GetCommand({ TableName: tables().users, Key: { user_id: userId } })
  );
  if (!res.Item) return notFound("Profile not found");
  return json(200, res.Item);
}

async function handlePutProfile(userId, body) {
  const { errors, details, value } = validateProfile(body);
  if (errors.length > 0) return validationError(details);
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
  return json(200, res.Attributes || {});
}

// ---- generic collection helpers ----

async function handleList(tableName, userId) {
  const doc = getDocClient();
  const res = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "user_id = :u",
      ExpressionAttributeValues: { ":u": userId },
    })
  );
  // List shape follows contracts/openapi.yaml: a bare JSON array.
  return json(200, res.Items || []);
}

async function handleCreate(tableName, userId, idField, value) {
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
  return json(201, item);
}

async function handleUpdate(tableName, userId, idField, id, value) {
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
  try {
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
    return json(200, res.Attributes || {});
  } catch (e) {
    if (isConditionalMiss(e)) return notFound(`${idField} not found`);
    throw e;
  }
}

async function handleDelete(tableName, userId, idField, id) {
  const doc = getDocClient();
  try {
    await doc.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { user_id: userId, [idField]: id },
        ConditionExpression: `attribute_exists(${idField})`,
      })
    );
    return { statusCode: 204, headers: {}, body: "" };
  } catch (e) {
    if (isConditionalMiss(e)) return notFound(`${idField} not found`);
    throw e;
  }
}

async function getUserDob(userId) {
  const doc = getDocClient();
  const res = await doc.send(
    new GetCommand({ TableName: tables().users, Key: { user_id: userId } })
  );
  const dob = res.Item && res.Item.date_of_birth;
  return typeof dob === "string" ? dob : null;
}

// ---- dispatch ----

async function route(event, userId) {
  const t = tables();
  const http = (event && event.requestContext && event.requestContext.http) || {};
  const method = (http.method || event.httpMethod || "").toUpperCase();
  const path = http.path || event.rawPath || event.path || "";

  let body = {};
  if (method === "POST" || method === "PUT") {
    const parsed = parseBody(event);
    if (!parsed.ok) return validationError({ body: "invalid JSON body" });
    body = parsed.body;
  }

  let m;

  if (method === "GET" && path === "/me") return handleGetMe(userId);
  if (method === "PUT" && path === "/me/profile") return handlePutProfile(userId, body);

  if (method === "GET" && path === "/holdings") return handleList(t.holdings, userId);
  if (method === "POST" && path === "/holdings") {
    const { errors, details, value } = validateHolding(body, { requireCreate: true });
    if (errors.length > 0) return validationError(details);
    return handleCreate(t.holdings, userId, "holding_id", value);
  }
  if ((m = /^\/holdings\/([^/]+)$/.exec(path)) && (method === "PUT" || method === "DELETE")) {
    if (method === "DELETE") return handleDelete(t.holdings, userId, "holding_id", m[1]);
    const { errors, details, value } = validateHolding(body);
    if (errors.length > 0) return validationError(details);
    return handleUpdate(t.holdings, userId, "holding_id", m[1], value);
  }

  if (method === "GET" && path === "/goals") return handleList(t.goals, userId);
  if (method === "POST" && path === "/goals") {
    const dob = await getUserDob(userId);
    const { errors, details, value } = validateGoal(body, dob, { requireCreate: true });
    if (errors.length > 0) return validationError(details);
    return handleCreate(t.goals, userId, "goal_id", applyGoalDefaults(value));
  }
  if ((m = /^\/goals\/([^/]+)$/.exec(path)) && (method === "PUT" || method === "DELETE")) {
    if (method === "DELETE") return handleDelete(t.goals, userId, "goal_id", m[1]);
    const dob = await getUserDob(userId);
    const { errors, details, value } = validateGoal(body, dob);
    if (errors.length > 0) return validationError(details);
    return handleUpdate(t.goals, userId, "goal_id", m[1], value);
  }

  if (method === "GET" && path === "/loans") return handleList(t.loans, userId);
  if (method === "POST" && path === "/loans") {
    const { errors, details, value } = validateLoan(body, { requireCreate: true });
    if (errors.length > 0) return validationError(details);
    return handleCreate(t.loans, userId, "loan_id", applyLoanDefaults(value));
  }
  if ((m = /^\/loans\/([^/]+)$/.exec(path)) && (method === "PUT" || method === "DELETE")) {
    if (method === "DELETE") return handleDelete(t.loans, userId, "loan_id", m[1]);
    const { errors, details, value } = validateLoan(body);
    if (errors.length > 0) return validationError(details);
    return handleUpdate(t.loans, userId, "loan_id", m[1], value);
  }

  return notFound(`Unknown route ${method} ${path}`);
}

module.exports = { route };
