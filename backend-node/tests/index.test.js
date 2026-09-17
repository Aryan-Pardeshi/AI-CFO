"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
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
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const db = require("../src/db");
const { handler, getAuthenticatedUserId } = require("../index");

const ddbMock = mockClient(DynamoDBDocumentClient);
db._setDocClient(ddbMock);

const SUB = "jwt-sub-abc";

function evt(method, path, opts = {}) {
  const { body, sub = SUB } = opts;
  const event = {
    requestContext: { http: { method, path }, authorizer: { jwt: { claims: {} } } },
  };
  if (sub !== undefined && sub !== null) {
    event.requestContext.authorizer.jwt.claims.sub = sub;
  }
  if (body !== undefined) {
    event.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return event;
}

let savedSamLocal;
beforeEach(() => {
  ddbMock.reset();
  savedSamLocal = process.env.AWS_SAM_LOCAL;
  delete process.env.AWS_SAM_LOCAL;
});
afterEach(() => {
  if (savedSamLocal === undefined) delete process.env.AWS_SAM_LOCAL;
  else process.env.AWS_SAM_LOCAL = savedSamLocal;
});

describe("getAuthenticatedUserId", () => {
  it("returns sub from JWT claims", () => {
    assert.equal(getAuthenticatedUserId(evt("GET", "/me")), SUB);
  });

  it("throws 401 when sub missing", () => {
    for (const e of [
      evt("GET", "/me", { sub: null }),
      { requestContext: { http: { method: "GET", path: "/me" } } },
      { requestContext: { authorizer: { jwt: { claims: {} } } } },
      {},
    ]) {
      assert.throws(() => getAuthenticatedUserId(e), (err) => err.statusCode === 401);
    }
  });

  it("throws 401 when sub is not a string", () => {
    assert.throws(() => getAuthenticatedUserId(evt("GET", "/me", { sub: 123 })), (e) => e.statusCode === 401);
    assert.throws(() => getAuthenticatedUserId(evt("GET", "/me", { sub: "" })), (e) => e.statusCode === 401);
  });

  it("SAM_LOCAL=true falls back to local-dev-user only when no sub", () => {
    process.env.AWS_SAM_LOCAL = "true";
    assert.equal(getAuthenticatedUserId(evt("GET", "/me", { sub: null })), "local-dev-user");
    assert.equal(getAuthenticatedUserId(evt("GET", "/me", { sub: SUB })), SUB);
  });

  it("fallback NOT reachable unless env is exactly 'true'", () => {
    for (const v of ["True", "TRUE", "1", "", "false"]) {
      process.env.AWS_SAM_LOCAL = v;
      assert.throws(
        () => getAuthenticatedUserId(evt("GET", "/me", { sub: null })),
        (e) => e.statusCode === 401,
        `AWS_SAM_LOCAL=${v} should not fall back`
      );
    }
  });
});

describe("handler auth (401 shape)", () => {
  it("missing sub -> 401 UNAUTHORIZED shape, no DB call", async () => {
    const res = await handler(evt("GET", "/me", { sub: null }), {});
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "UNAUTHORIZED");
    assert.ok(typeof body.error.message === "string" && body.error.message.length > 0);
    assert.equal(ddbMock.commandCalls(GetCommand).length, 0);
  });

  it("non-string sub -> 401 UNAUTHORIZED", async () => {
    const res = await handler(evt("GET", "/me", { sub: 42 }), {});
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(res.body).error.code, "UNAUTHORIZED");
  });

  it("no fallback in deployed-like event (env unset)", async () => {
    delete process.env.AWS_SAM_LOCAL;
    const res = await handler(evt("GET", "/me", { sub: null }), {});
    assert.equal(res.statusCode, 401);
  });

  it("no fallback when env is '1' (must be exactly 'true')", async () => {
    process.env.AWS_SAM_LOCAL = "1";
    const res = await handler(evt("GET", "/me", { sub: null }), {});
    assert.equal(res.statusCode, 401);
  });

  it("SAM_LOCAL=true with no sub acts as local-dev-user", async () => {
    process.env.AWS_SAM_LOCAL = "true";
    ddbMock.on(GetCommand).resolves({});
    const res = await handler(evt("GET", "/me", { sub: null }), {});
    assert.equal(res.statusCode, 404); // authed, then profile miss
    assert.equal(ddbMock.commandCalls(GetCommand)[0].args[0].input.Key.user_id, "local-dev-user");
  });
});

describe("body user_id never used for identity", () => {
  it("PUT /me/profile Key.user_id is JWT sub, not body user_id", async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { user_id: SUB } });
    const res = await handler(
      evt("PUT", "/me/profile", { body: { user_id: "evil-id", name: "A" } }),
      {}
    );
    assert.equal(res.statusCode, 200);
    const key = ddbMock.commandCalls(UpdateCommand)[0].args[0].input.Key;
    assert.equal(key.user_id, SUB);
    assert.notEqual(key.user_id, "evil-id");
  });

  it("POST /holdings Item.user_id is JWT sub, not body user_id", async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await handler(
      evt("POST", "/holdings", {
        body: { user_id: "evil-id", asset_type: "STOCK", name: "X", quantity: 1 },
      }),
      {}
    );
    assert.equal(res.statusCode, 201);
    const item = JSON.parse(res.body);
    assert.equal(item.user_id, SUB);
    const putItem = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    assert.equal(putItem.user_id, SUB);
  });
});
