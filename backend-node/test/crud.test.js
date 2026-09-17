"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.USERS_TABLE = "users";
process.env.HOLDINGS_TABLE = "holdings";
process.env.GOALS_TABLE = "goals";
process.env.LOANS_TABLE = "loans";

const { mockClient } = require("aws-sdk-client-mock");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const { handler } = require("../index");

const ddbMock = mockClient(DynamoDBDocumentClient);

const SUB = "jwt-sub-123";

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

function condFail() {
  return Object.assign(new Error("condition failed"), {
    name: "ConditionalCheckFailedException",
  });
}

beforeEach(() => {
  ddbMock.reset();
  delete process.env.AWS_SAM_LOCAL;
});

describe("auth", () => {
  it("401 when JWT sub missing, no dev fallback when AWS_SAM_LOCAL unset", async () => {
    const res = await handler(evt("GET", "/me", { sub: null }), {});
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(res.body).error.code, "UNAUTHORIZED");
  });

  it("unknown route -> 404", async () => {
    const res = await handler(evt("GET", "/nope"), {});
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error.code, "NOT_FOUND");
  });

  it("invalid JSON body -> 400 VALIDATION_ERROR", async () => {
    const res = await handler(evt("PUT", "/me/profile", { body: "{bad json" }), {});
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error.code, "VALIDATION_ERROR");
  });
});

describe("/me", () => {
  it("body user_id ignored: write uses JWT sub", async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { user_id: SUB, name: "A" } });
    const res = await handler(
      evt("PUT", "/me/profile", { body: { user_id: "evil-id", name: "A" } }),
      {}
    );
    assert.equal(res.statusCode, 200);
    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].args[0].input.Key.user_id, SUB);
    assert.equal(JSON.parse(res.body).user_id, SUB);
  });

  it("GET /me 404 when no row", async () => {
    ddbMock.on(GetCommand).resolves({});
    const res = await handler(evt("GET", "/me"), {});
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error.code, "NOT_FOUND");
  });

  it("PUT /me/profile single UpdateCommand, empty body only touches timestamps", async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { user_id: SUB, created_at: "t", updated_at: "t2" },
    });
    const res = await handler(evt("PUT", "/me/profile", { body: {} }), {});
    assert.equal(res.statusCode, 200);
    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    assert.equal(updateCalls.length, 1);
    const input = updateCalls[0].args[0].input;
    assert.equal(input.Key.user_id, SUB);
    assert.equal(input.ReturnValues, "ALL_NEW");
    assert.ok(input.UpdateExpression.includes("if_not_exists"));
    assert.ok(input.UpdateExpression.includes("created_at"));
    assert.ok(input.UpdateExpression.includes("updated_at"));
    assert.equal(ddbMock.commandCalls(GetCommand).length, 0);
    assert.equal(ddbMock.commandCalls(PutCommand).length, 0);
  });

  it("PUT /me/profile returns Attributes, sets provided fields", async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { user_id: SUB, name: "B", updated_at: "t2", created_at: "t" },
    });
    const res = await handler(evt("PUT", "/me/profile", { body: { name: "B" } }), {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.name, "B");
    assert.equal(body.created_at, "t");
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    assert.equal(input.Key.user_id, SUB);
    assert.ok(input.UpdateExpression.includes("if_not_exists"));
  });

  it("10-crore bound: 10000000000 accepted, 10000000001 rejected", async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { user_id: SUB, monthly_income_paise: 10000000000 },
    });
    const ok = await handler(
      evt("PUT", "/me/profile", { body: { monthly_income_paise: 10000000000 } }),
      {}
    );
    assert.equal(ok.statusCode, 200);

    const bad = await handler(
      evt("PUT", "/me/profile", { body: { monthly_income_paise: 10000000001 } }),
      {}
    );
    assert.equal(bad.statusCode, 400);
    const details = JSON.parse(bad.body).error.details;
    assert.ok(details.monthly_income_paise);
  });

  it("risk_answers: bad values rejected, good values accepted", async () => {
    const bad = await handler(
      evt("PUT", "/me/profile", { body: { risk_answers: [1, 2, 3, 4] } }),
      {}
    );
    assert.equal(bad.statusCode, 400);
    assert.ok(JSON.parse(bad.body).error.details.risk_answers);

    ddbMock.on(UpdateCommand).resolves({
      Attributes: { user_id: SUB, risk_answers: [1, 2, 2, 3], risk_score: 8 },
    });
    const ok = await handler(
      evt("PUT", "/me/profile", {
        body: { risk_answers: [1, 2, 2, 3], risk_score: 8 },
      }),
      {}
    );
    assert.equal(ok.statusCode, 200);
  });

  it("risk consistency: mismatch rejected, match accepted", async () => {
    const mismatch = await handler(
      evt("PUT", "/me/profile", {
        body: { risk_answers: [1, 1, 1, 1], risk_score: 8 },
      }),
      {}
    );
    assert.equal(mismatch.statusCode, 400);
    assert.ok(JSON.parse(mismatch.body).error.details.risk_score);

    ddbMock.on(UpdateCommand).resolves({
      Attributes: { user_id: SUB, risk_answers: [1, 1, 1, 1], risk_score: 4 },
    });
    const match = await handler(
      evt("PUT", "/me/profile", {
        body: { risk_answers: [1, 1, 1, 1], risk_score: 4 },
      }),
      {}
    );
    assert.equal(match.statusCode, 200);
  });

  it("profile bounds: emergency/horizon/onboarding/dependents", async () => {
    for (const body of [
      { emergency_fund_target_months: 25 },
      { emergency_fund_target_months: -1 },
      { investment_horizon_years: 61 },
      { onboarding_step: 9 },
      { dependents_count: 21 },
    ]) {
      const res = await handler(evt("PUT", "/me/profile", { body }), {});
      assert.equal(res.statusCode, 400);
    }
    ddbMock.on(UpdateCommand).resolves({
      Attributes: {
        user_id: SUB,
        emergency_fund_target_months: 24,
        investment_horizon_years: 60,
        onboarding_step: 8,
        dependents_count: 20,
      },
    });
    const ok = await handler(
      evt("PUT", "/me/profile", {
        body: {
          emergency_fund_target_months: 24,
          investment_horizon_years: 60,
          onboarding_step: 8,
          dependents_count: 20,
        },
      }),
      {}
    );
    assert.equal(ok.statusCode, 200);
  });

  it("base64-encoded JSON body is parsed", async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { user_id: SUB, name: "B64" } });
    const event = evt("PUT", "/me/profile", {});
    event.body = Buffer.from(JSON.stringify({ name: "B64" }), "utf8").toString("base64");
    event.isBase64Encoded = true;
    const res = await handler(event, {});
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).name, "B64");
  });
});

describe("/holdings", () => {
  it("float paise rejected", async () => {
    const res = await handler(
      evt("POST", "/holdings", {
        body: {
          asset_type: "STOCK",
          source: "MANUAL",
          name: "X",
          quantity: 1,
          manual_current_value_paise: 10.5,
        },
      }),
      {}
    );
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error.details.manual_current_value_paise);
  });

  it("bad asset_type rejected", async () => {
    const res = await handler(
      evt("POST", "/holdings", { body: { asset_type: "STONK", source: "MANUAL", name: "X" } }),
      {}
    );
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error.details.asset_type);
  });

  it("unknown field rejected", async () => {
    const res = await handler(
      evt("POST", "/holdings", {
        body: { asset_type: "STOCK", source: "MANUAL", name: "X", quantity: 1, nope: 1 },
      }),
      {}
    );
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error.details.nope);
  });

  it("valid holding -> 201 with server-generated holding_id", async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await handler(
      evt("POST", "/holdings", {
        body: {
          holding_id: "client-id",
          asset_type: "STOCK",
          source: "MANUAL",
          name: "X",
          quantity: 2,
        },
      }),
      {}
    );
    assert.equal(res.statusCode, 201);
    const item = JSON.parse(res.body);
    assert.ok(typeof item.holding_id === "string" && item.holding_id.length > 0);
    assert.notEqual(item.holding_id, "client-id");
    assert.equal(item.user_id, SUB);
  });

  it("POST requires asset_type and name", async () => {
    const res = await handler(evt("POST", "/holdings", { body: {} }), {});
    assert.equal(res.statusCode, 400);
    const details = JSON.parse(res.body).error.details;
    assert.ok(details.asset_type);
    assert.ok(details.name);
  });

  it("POST STOCK without quantity -> 400, PUT partial without quantity ok", async () => {
    const post = await handler(
      evt("POST", "/holdings", {
        body: { asset_type: "STOCK", source: "MANUAL", name: "X" },
      }),
      {}
    );
    assert.equal(post.statusCode, 400);
    assert.ok(JSON.parse(post.body).error.details.quantity);

    ddbMock.on(UpdateCommand).resolves({ Attributes: { holding_id: "h1", name: "X" } });
    const put = await handler(evt("PUT", "/holdings/h1", { body: { name: "X" } }), {});
    assert.equal(put.statusCode, 200);
  });

  it("POST FD without fd_principal_paise -> 400; source omitted defaults to MANUAL", async () => {
    const missing = await handler(
      evt("POST", "/holdings", { body: { asset_type: "FD", name: "My FD" } }),
      {}
    );
    assert.equal(missing.statusCode, 400);
    assert.ok(JSON.parse(missing.body).error.details.fd_principal_paise);

    ddbMock.on(PutCommand).resolves({});
    const res = await handler(
      evt("POST", "/holdings", {
        body: { asset_type: "FD", name: "My FD", fd_principal_paise: 100000 },
      }),
      {}
    );
    assert.equal(res.statusCode, 201);
    assert.equal(JSON.parse(res.body).source, "MANUAL");
  });

  it("quantity 0 and negative rejected, positive accepted", async () => {
    for (const q of [0, -1]) {
      const res = await handler(
        evt("POST", "/holdings", {
          body: { asset_type: "STOCK", source: "MANUAL", name: "X", quantity: q },
        }),
        {}
      );
      assert.equal(res.statusCode, 400);
      assert.ok(JSON.parse(res.body).error.details.quantity);
    }
    ddbMock.on(PutCommand).resolves({});
    const ok = await handler(
      evt("POST", "/holdings", {
        body: { asset_type: "STOCK", source: "MANUAL", name: "X", quantity: 1.5 },
      }),
      {}
    );
    assert.equal(ok.statusCode, 201);
  });

  it("name 201 chars rejected; symbol 101 chars rejected; fd_annual_rate bounds", async () => {
    const longName = await handler(
      evt("POST", "/holdings", {
        body: { asset_type: "STOCK", source: "MANUAL", name: "n".repeat(201), quantity: 1 },
      }),
      {}
    );
    assert.equal(longName.statusCode, 400);
    assert.ok(JSON.parse(longName.body).error.details.name);

    const longSym = await handler(
      evt("POST", "/holdings", {
        body: {
          asset_type: "STOCK",
          source: "MANUAL",
          name: "X",
          quantity: 1,
          symbol: "s".repeat(101),
        },
      }),
      {}
    );
    assert.equal(longSym.statusCode, 400);
    assert.ok(JSON.parse(longSym.body).error.details.symbol);

    for (const rate of [-0.01, 0.37, 8.5]) {
      const res = await handler(
        evt("POST", "/holdings", {
          body: {
            asset_type: "FD",
            source: "MANUAL",
            name: "FD",
            fd_principal_paise: 100,
            fd_annual_rate: rate,
          },
        }),
        {}
      );
      assert.equal(res.statusCode, 400);
      assert.ok(JSON.parse(res.body).error.details.fd_annual_rate);
    }
  });

  it("list returns bare array per openapi", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ user_id: SUB, holding_id: "h1" }] });
    const res = await handler(evt("GET", "/holdings"), {});
    assert.equal(res.statusCode, 200);
    const items = JSON.parse(res.body);
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 1);
  });

  it("PUT/DELETE on missing id -> 404 via ConditionExpression", async () => {
    ddbMock.on(UpdateCommand).rejects(condFail());
    const put = await handler(
      evt("PUT", "/holdings/h-missing", {
        body: { asset_type: "STOCK", source: "MANUAL", name: "X" },
      }),
      {}
    );
    assert.equal(put.statusCode, 404);
    assert.equal(JSON.parse(put.body).error.code, "NOT_FOUND");
    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    assert.ok(updateCalls[0].args[0].input.ConditionExpression.includes("attribute_exists"));

    ddbMock.on(DeleteCommand).rejects(condFail());
    const del = await handler(evt("DELETE", "/holdings/h-missing"), {});
    assert.equal(del.statusCode, 404);
    assert.equal(JSON.parse(del.body).error.code, "NOT_FOUND");
  });
});

describe("/goals + /loans ids", () => {
  it("PUT/DELETE on missing goal/loan id -> 404", async () => {
    ddbMock.on(GetCommand).resolves({}); // no dob stored
    ddbMock.on(UpdateCommand).rejects(condFail());
    const put = await handler(
      evt("PUT", "/goals/g-missing", {
        body: { name: "G", goal_type: "CAR", amount_today_paise: 100, target_age: 30 },
      }),
      {}
    );
    assert.equal(put.statusCode, 404);

    ddbMock.on(DeleteCommand).rejects(condFail());
    const del = await handler(evt("DELETE", "/loans/l-missing"), {});
    assert.equal(del.statusCode, 404);
    assert.equal(JSON.parse(del.body).error.code, "NOT_FOUND");
  });

  it("goal inflation default: EDUCATION 0.10 else 0.06", async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});
    const edu = await handler(
      evt("POST", "/goals", {
        body: { name: "G", goal_type: "EDUCATION", amount_today_paise: 100, target_age: 30 },
      }),
      {}
    );
    assert.equal(edu.statusCode, 201);
    assert.equal(JSON.parse(edu.body).inflation_rate, 0.1);

    const car = await handler(
      evt("POST", "/goals", {
        body: { name: "G", goal_type: "CAR", amount_today_paise: 100, target_age: 30 },
      }),
      {}
    );
    assert.equal(car.statusCode, 201);
    assert.equal(JSON.parse(car.body).inflation_rate, 0.06);
  });

  it("POST /goals missing required fields -> 400 naming each", async () => {
    ddbMock.on(GetCommand).resolves({});
    const res = await handler(evt("POST", "/goals", { body: {} }), {});
    assert.equal(res.statusCode, 400);
    const details = JSON.parse(res.body).error.details;
    assert.ok(details.name);
    assert.ok(details.goal_type);
    assert.ok(details.amount_today_paise);
    assert.ok(details.target_age);
  });

  it("PUT /goals partial stays allowed", async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({ Attributes: { goal_id: "g1", name: "Only name" } });
    const res = await handler(evt("PUT", "/goals/g1", { body: { name: "Only name" } }), {});
    assert.equal(res.statusCode, 200);
  });
});

describe("/loans tenure", () => {
  function loanBody(tenure) {
    return {
      name: "L",
      loan_type: "HOME",
      principal_paise: 100,
      outstanding_paise: 90,
      annual_rate: 0.08,
      tenure_months: tenure,
      start_date: "2024-01-01",
      rate_type: "FIXED",
    };
  }

  it("tenure 0 and 481 rejected, 480 accepted", async () => {
    const zero = await handler(evt("POST", "/loans", { body: loanBody(0) }), {});
    assert.equal(zero.statusCode, 400);
    assert.ok(JSON.parse(zero.body).error.details.tenure_months);

    const over = await handler(evt("POST", "/loans", { body: loanBody(481) }), {});
    assert.equal(over.statusCode, 400);
    assert.ok(JSON.parse(over.body).error.details.tenure_months);

    ddbMock.on(PutCommand).resolves({});
    const max = await handler(evt("POST", "/loans", { body: loanBody(480) }), {});
    assert.equal(max.statusCode, 201);
    assert.equal(JSON.parse(max.body).prepayment_charge_pct, 0);
  });

  it("POST /loans missing required fields -> 400 naming each", async () => {
    const res = await handler(evt("POST", "/loans", { body: {} }), {});
    assert.equal(res.statusCode, 400);
    const details = JSON.parse(res.body).error.details;
    assert.ok(details.name);
    assert.ok(details.loan_type);
    assert.ok(details.outstanding_paise);
    assert.ok(details.annual_rate);
    assert.ok(details.tenure_months);
  });

  it("prepayment_charge_pct 0..100; loan name 201 chars rejected", async () => {
    const base = {
      name: "L",
      loan_type: "HOME",
      outstanding_paise: 90,
      annual_rate: 0.08,
      tenure_months: 12,
    };
    for (const pct of [-1, 101]) {
      const res = await handler(
        evt("POST", "/loans", { body: { ...base, prepayment_charge_pct: pct } }),
        {}
      );
      assert.equal(res.statusCode, 400);
      assert.ok(JSON.parse(res.body).error.details.prepayment_charge_pct);
    }
    const longName = await handler(
      evt("POST", "/loans", { body: { ...base, name: "n".repeat(201) } }),
      {}
    );
    assert.equal(longName.statusCode, 400);
    assert.ok(JSON.parse(longName.body).error.details.name);

    ddbMock.on(PutCommand).resolves({});
    const ok = await handler(
      evt("POST", "/loans", { body: { ...base, prepayment_charge_pct: 100 } }),
      {}
    );
    assert.equal(ok.statusCode, 201);
  });
});

describe("rates are decimal fractions", () => {
  it("loan annual_rate: 0.085 accepted, 8.5 (percent) rejected, 0.36 boundary accepted", async () => {
    ddbMock.reset();
    ddbMock.on(PutCommand).resolves({});
    const body = (annual_rate) => ({
      name: "Home loan",
      loan_type: "HOME",
      outstanding_paise: 420000000,
      annual_rate,
      tenure_months: 240,
    });
    const ok = await handler(evt("POST", "/loans", { body: body(0.085) }), {});
    assert.equal(ok.statusCode, 201);
    const edge = await handler(evt("POST", "/loans", { body: body(0.36) }), {});
    assert.equal(edge.statusCode, 201);
    const pct = await handler(evt("POST", "/loans", { body: body(8.5) }), {});
    assert.equal(pct.statusCode, 400);
    assert.ok(JSON.parse(pct.body).error.details.annual_rate);
  });
});
