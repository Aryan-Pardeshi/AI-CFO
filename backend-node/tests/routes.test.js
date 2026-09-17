"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.USERS_TABLE = process.env.USERS_TABLE || "users-test";
process.env.HOLDINGS_TABLE = process.env.HOLDINGS_TABLE || "holdings-test";
process.env.GOALS_TABLE = process.env.GOALS_TABLE || "goals-test";
process.env.LOANS_TABLE = process.env.LOANS_TABLE || "loans-test";

const { mockClient } = require("aws-sdk-client-mock");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const db = require("../src/db");
const { route } = require("../src/routes");
const { calcAge } = require("../src/validate");

const ddbMock = mockClient(DynamoDBDocumentClient);
db._setDocClient(ddbMock);

const UID = "route-test-user";

function evt(method, path, body) {
  const event = { requestContext: { http: { method, path } } };
  if (body !== undefined) {
    event.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return event;
}

function condFail() {
  return Object.assign(new Error("The conditional request failed"), {
    name: "ConditionalCheckFailedException",
  });
}

function dobForAge(age) {
  const now = new Date();
  const y = now.getUTCFullYear() - age;
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

beforeEach(() => {
  ddbMock.reset();
});

describe("GET /me", () => {
  it("200 with item when found", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { user_id: UID, name: "A" } });
    const res = await route(evt("GET", "/me"), UID);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { user_id: UID, name: "A" });
    const calls = ddbMock.commandCalls(GetCommand);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[0].input.Key.user_id, UID);
  });

  it("404 NOT_FOUND when not found", async () => {
    ddbMock.on(GetCommand).resolves({});
    const res = await route(evt("GET", "/me"), UID);
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error.code, "NOT_FOUND");
  });
});

describe("PUT /me/profile", () => {
  it("partial update via UpdateCommand, updated_at always, created_at via if_not_exists", async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { user_id: UID, name: "B" } });
    const res = await route(evt("PUT", "/me/profile", { name: "B" }), UID);
    assert.equal(res.statusCode, 200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    assert.equal(input.Key.user_id, UID);
    assert.equal(input.ReturnValues, "ALL_NEW");
    assert.ok(input.UpdateExpression.includes("#updated_at = :now"));
    assert.ok(input.UpdateExpression.includes("#created_at = if_not_exists(#created_at, :now)"));
    assert.ok(input.ExpressionAttributeNames["#updated_at"] === "updated_at");
  });

  it("validation errors surface as 400 VALIDATION_ERROR with details keyed by field", async () => {
    const res = await route(evt("PUT", "/me/profile", { bogus_xyz: 1 }), UID);
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.details.bogus_xyz);
    assert.equal(ddbMock.commandCalls(UpdateCommand).length, 0);
  });
});

describe("holdings collection", () => {
  it("list returns a bare array", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ user_id: UID, holding_id: "h1" }] });
    const res = await route(evt("GET", "/holdings"), UID);
    assert.equal(res.statusCode, 200);
    const items = JSON.parse(res.body);
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 1);
  });

  it("list returns [] when no Items", async () => {
    ddbMock.on(QueryCommand).resolves({});
    const res = await route(evt("GET", "/holdings"), UID);
    assert.deepEqual(JSON.parse(res.body), []);
  });

  it("POST 201 with server-generated holding_id (never client's)", async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await route(
      evt("POST", "/holdings", {
        holding_id: "client-spoof",
        user_id: "evil",
        asset_type: "STOCK",
        name: "X",
        quantity: 2,
      }),
      UID
    );
    assert.equal(res.statusCode, 201);
    const item = JSON.parse(res.body);
    assert.ok(typeof item.holding_id === "string" && item.holding_id.length > 0);
    assert.notEqual(item.holding_id, "client-spoof");
    assert.equal(item.user_id, UID);
    const putInput = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    assert.equal(putInput.user_id, UID);
    assert.notEqual(putInput.holding_id, "client-spoof");
    assert.ok(putInput.created_at && putInput.updated_at);
  });

  it("POST STOCK without quantity -> 400", async () => {
    const res = await route(evt("POST", "/holdings", { asset_type: "STOCK", name: "X" }), UID);
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error.details.quantity);
  });

  it("POST FD without fd_principal_paise -> 400", async () => {
    const res = await route(evt("POST", "/holdings", { asset_type: "FD", name: "FD" }), UID);
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error.details.fd_principal_paise);
  });

  it("PUT missing id -> 404 via ConditionalCheckFailedException (not 500)", async () => {
    ddbMock.on(UpdateCommand).rejects(condFail());
    const res = await route(evt("PUT", "/holdings/nope", { name: "X" }), UID);
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error.code, "NOT_FOUND");
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    assert.ok(input.ConditionExpression.includes("attribute_exists(holding_id)"));
  });

  it("DELETE missing id -> 404 via ConditionalCheckFailedException", async () => {
    ddbMock.on(DeleteCommand).rejects(condFail());
    const res = await route(evt("DELETE", "/holdings/nope"), UID);
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error.code, "NOT_FOUND");
  });

  it("PUT success returns Attributes", async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { holding_id: "h1", name: "New" } });
    const res = await route(evt("PUT", "/holdings/h1", { name: "New" }), UID);
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).name, "New");
  });

  it("DELETE success -> 204", async () => {
    ddbMock.on(DeleteCommand).resolves({});
    const res = await route(evt("DELETE", "/holdings/h1"), UID);
    assert.equal(res.statusCode, 204);
  });
});

describe("goals collection", () => {
  function goalBody(extra = {}) {
    return { name: "G", goal_type: "CAR", amount_today_paise: 100, target_age: 30, ...extra };
  }

  it("list returns an array", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const res = await route(evt("GET", "/goals"), UID);
    assert.deepEqual(JSON.parse(res.body), []);
  });

  it("POST 201 with server-generated goal_id", async () => {
    ddbMock.on(GetCommand).resolves({}); // no dob
    ddbMock.on(PutCommand).resolves({});
    const res = await route(evt("POST", "/goals", { ...goalBody(), goal_id: "spoof" }), UID);
    assert.equal(res.statusCode, 201);
    const item = JSON.parse(res.body);
    assert.notEqual(item.goal_id, "spoof");
    assert.equal(item.user_id, UID);
  });

  it("POST missing required fields -> 400 naming each", async () => {
    ddbMock.on(GetCommand).resolves({});
    const res = await route(evt("POST", "/goals", {}), UID);
    assert.equal(res.statusCode, 400);
    const details = JSON.parse(res.body).error.details;
    for (const f of ["name", "goal_type", "amount_today_paise", "target_age"]) {
      assert.ok(details[f], `missing ${f}`);
    }
  });

  it("POST calls getUserDob first (GetCommand on users table)", async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});
    await route(evt("POST", "/goals", goalBody()), UID);
    const gets = ddbMock.commandCalls(GetCommand);
    assert.ok(gets.length >= 1);
    assert.equal(gets[0].args[0].input.TableName, process.env.USERS_TABLE);
    assert.equal(gets[0].args[0].input.Key.user_id, UID);
  });

  it("target_age below current_age+1 rejected when DOB known", async () => {
    const dob = dobForAge(30);
    const min = calcAge(dob) + 1;
    ddbMock.on(GetCommand).resolves({ Item: { user_id: UID, date_of_birth: dob } });
    const res = await route(evt("POST", "/goals", goalBody({ target_age: min - 1 })), UID);
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error.details.target_age);
  });

  it("works with 1..91 defaults when user has no date_of_birth", async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});
    const ok = await route(evt("POST", "/goals", goalBody({ target_age: 30 })), UID);
    assert.equal(ok.statusCode, 201);
    const bad = await route(evt("POST", "/goals", goalBody({ target_age: 0 })), UID);
    assert.equal(bad.statusCode, 400);
  });

  it("PUT/DELETE unknown goal id -> 404", async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock.on(UpdateCommand).rejects(condFail());
    const put = await route(evt("PUT", "/goals/zzz", { name: "N" }), UID);
    assert.equal(put.statusCode, 404);
    ddbMock.on(DeleteCommand).rejects(condFail());
    const del = await route(evt("DELETE", "/goals/zzz"), UID);
    assert.equal(del.statusCode, 404);
    assert.equal(JSON.parse(del.body).error.code, "NOT_FOUND");
  });
});

describe("loans collection", () => {
  function loanBody(extra = {}) {
    return {
      name: "L",
      loan_type: "HOME",
      outstanding_paise: 90,
      annual_rate: 0.08,
      tenure_months: 12,
      ...extra,
    };
  }

  it("list returns an array", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ loan_id: "l1" }] });
    const res = await route(evt("GET", "/loans"), UID);
    assert.ok(Array.isArray(JSON.parse(res.body)));
  });

  it("POST 201 with server-generated loan_id + prepayment default", async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await route(evt("POST", "/loans", { ...loanBody(), loan_id: "spoof" }), UID);
    assert.equal(res.statusCode, 201);
    const item = JSON.parse(res.body);
    assert.notEqual(item.loan_id, "spoof");
    assert.equal(item.prepayment_charge_pct, 0);
  });

  it("POST missing required fields -> 400 naming each", async () => {
    const res = await route(evt("POST", "/loans", {}), UID);
    assert.equal(res.statusCode, 400);
    const details = JSON.parse(res.body).error.details;
    for (const f of ["name", "loan_type", "outstanding_paise", "annual_rate", "tenure_months"]) {
      assert.ok(details[f], `missing ${f}`);
    }
  });

  it("PUT/DELETE unknown loan id -> 404", async () => {
    ddbMock.on(UpdateCommand).rejects(condFail());
    const put = await route(evt("PUT", "/loans/zzz", { name: "N" }), UID);
    assert.equal(put.statusCode, 404);
    ddbMock.on(DeleteCommand).rejects(condFail());
    const del = await route(evt("DELETE", "/loans/zzz"), UID);
    assert.equal(del.statusCode, 404);
  });
});

describe("unknown routes and bad bodies", () => {
  it("unknown method+path -> 404 NOT_FOUND", async () => {
    for (const [m, p] of [["GET", "/nope"], ["POST", "/me"], ["DELETE", "/goals"], ["PATCH", "/loans/x"]]) {
      const res = await route(evt(m, p, {}), UID);
      assert.equal(res.statusCode, 404, `${m} ${p}`);
      assert.equal(JSON.parse(res.body).error.code, "NOT_FOUND");
    }
  });

  it("invalid JSON body -> 400 VALIDATION_ERROR, not crash", async () => {
    const res = await route(evt("PUT", "/me/profile", "{bad json"), UID);
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error.code, "VALIDATION_ERROR");
  });

  it("array JSON body -> 400 VALIDATION_ERROR", async () => {
    const res = await route(evt("POST", "/holdings", JSON.stringify([1, 2])), UID);
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error.code, "VALIDATION_ERROR");
  });

  it("string JSON body -> 400 VALIDATION_ERROR", async () => {
    const res = await route(evt("POST", "/holdings", JSON.stringify("hi")), UID);
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error.code, "VALIDATION_ERROR");
  });

  it("numeric JSON body -> 400 VALIDATION_ERROR", async () => {
    const res = await route(evt("POST", "/loans", "42"), UID);
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error.code, "VALIDATION_ERROR");
  });
});
