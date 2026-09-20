"use strict";

/**
 * Credit-card loan metadata + monthly_emi_paise.
 * Spec: .agents/api-contract.md
 *   "#### Credit-card loan metadata (`CREDIT_CARD` only)"
 *   "#### `monthly_emi_paise` (read-only, `GET /loans` list items)"
 * Style follows tests/routes.test.js (route() called directly, db._setDocClient with
 * aws-sdk-client-mock) and tests/validate.test.js / test/crud.test.js conventions.
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.USERS_TABLE = process.env.USERS_TABLE || "users-test";
process.env.HOLDINGS_TABLE = process.env.HOLDINGS_TABLE || "holdings-test";
process.env.GOALS_TABLE = process.env.GOALS_TABLE || "goals-test";
process.env.LOANS_TABLE = process.env.LOANS_TABLE || "loans-test";

const { mockClient } = require("aws-sdk-client-mock");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const db = require("../src/db");
const { route } = require("../src/router");
const { monthlyEmiPaise } = require("../src/services/emi");

const ddbMock = mockClient(DynamoDBDocumentClient);
db._setDocClient(ddbMock);

const UID = "loan-card-test-user";

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

function cardLoanBody(extra = {}) {
  return {
    name: "Card",
    loan_type: "CREDIT_CARD",
    outstanding_paise: 50000,
    annual_rate: 0.36,
    tenure_months: 12,
    ...extra,
  };
}

// itemModel.update() builds ExpressionAttributeNames/Values as #f0/:v0, #f1/:v1, ...
// (plus a fixed #updated_at/:updated_at pair). This resolves a field's write value
// (or confirms it was never touched at all) from the real UpdateCommand input, so
// tests assert what was actually sent to DynamoDB, not just the response status.
function fieldWrite(input, field) {
  const entry = Object.entries(input.ExpressionAttributeNames).find(([, v]) => v === field);
  if (!entry) return { present: false };
  const idx = entry[0].slice(2); // "#f0" -> "0"
  return { present: true, value: input.ExpressionAttributeValues[`:v${idx}`] };
}

beforeEach(() => {
  ddbMock.reset();
});

describe("CREDIT_CARD create", () => {
  it("all three card fields -> 201, all three persisted (issuer trimmed)", async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await route(
      evt(
        "POST",
        "/loans",
        cardLoanBody({ issuer: "  HDFC Bank  ", credit_limit_paise: 500000, payment_due_day: 5 })
      ),
      UID
    );
    assert.equal(res.statusCode, 201);
    const item = JSON.parse(res.body);
    assert.equal(item.issuer, "HDFC Bank");
    assert.equal(item.credit_limit_paise, 500000);
    assert.equal(item.payment_due_day, 5);

    const putItem = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    assert.equal(putItem.issuer, "HDFC Bank");
    assert.equal(putItem.credit_limit_paise, 500000);
    assert.equal(putItem.payment_due_day, 5);
  });

  it("none of the card fields -> 201, no card keys written", async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await route(evt("POST", "/loans", cardLoanBody()), UID);
    assert.equal(res.statusCode, 201);
    const item = JSON.parse(res.body);
    assert.ok(!("issuer" in item));
    assert.ok(!("credit_limit_paise" in item));
    assert.ok(!("payment_due_day" in item));

    const putItem = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    assert.ok(!("issuer" in putItem));
    assert.ok(!("credit_limit_paise" in putItem));
    assert.ok(!("payment_due_day" in putItem));
  });

  it("HOME loan_type + any single card field -> 400 naming that field", async () => {
    const values = { issuer: "Bank", credit_limit_paise: 100000, payment_due_day: 5 };
    for (const field of Object.keys(values)) {
      const res = await route(
        evt("POST", "/loans", {
          name: "Home",
          loan_type: "HOME",
          outstanding_paise: 100000,
          annual_rate: 0.08,
          tenure_months: 240,
          [field]: values[field],
        }),
        UID
      );
      assert.equal(res.statusCode, 400, field);
      assert.ok(JSON.parse(res.body).error.details[field], field);
    }
  });
});

describe("invalid issuer", () => {
  const cases = [
    ["blank string", ""],
    ["whitespace-only", "    "],
    ["non-string (number)", 12345],
    ["non-string (object)", { name: "Bank" }],
    ["121 chars", "a".repeat(121)],
  ];
  for (const [label, value] of cases) {
    it(`${label} -> 400`, async () => {
      const res = await route(evt("POST", "/loans", cardLoanBody({ issuer: value })), UID);
      assert.equal(res.statusCode, 400, label);
      assert.ok(JSON.parse(res.body).error.details.issuer, label);
    });
  }

  it("120 chars (boundary) is accepted", async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await route(
      evt("POST", "/loans", cardLoanBody({ issuer: "a".repeat(120) })),
      UID
    );
    assert.equal(res.statusCode, 201);
    assert.equal(JSON.parse(res.body).issuer, "a".repeat(120));
  });
});

describe("invalid credit_limit_paise", () => {
  const cases = [
    ["negative", -1],
    ["non-integer", 1.5],
    ["above 10000000000", 10000000001],
    ["string", "500000"],
  ];
  for (const [label, value] of cases) {
    it(`${label} -> 400`, async () => {
      const res = await route(evt("POST", "/loans", cardLoanBody({ credit_limit_paise: value })), UID);
      assert.equal(res.statusCode, 400, label);
      assert.ok(JSON.parse(res.body).error.details.credit_limit_paise, label);
    });
  }

  it("exactly 10000000000 (boundary) is accepted", async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await route(
      evt("POST", "/loans", cardLoanBody({ credit_limit_paise: 10000000000 })),
      UID
    );
    assert.equal(res.statusCode, 201);
    assert.equal(JSON.parse(res.body).credit_limit_paise, 10000000000);
  });
});

describe("invalid payment_due_day", () => {
  const cases = [
    ["0", 0],
    ["32", 32],
    ["1.5", 1.5],
    ["string", "5"],
  ];
  for (const [label, value] of cases) {
    it(`${label} -> 400`, async () => {
      const res = await route(evt("POST", "/loans", cardLoanBody({ payment_due_day: value })), UID);
      assert.equal(res.statusCode, 400, label);
      assert.ok(JSON.parse(res.body).error.details.payment_due_day, label);
    });
  }

  it("1 and 31 (boundaries) are accepted", async () => {
    ddbMock.on(PutCommand).resolves({});
    for (const day of [1, 31]) {
      const res = await route(evt("POST", "/loans", cardLoanBody({ payment_due_day: day })), UID);
      assert.equal(res.statusCode, 201, String(day));
    }
  });
});

describe("PUT card-metadata update on a stored CREDIT_CARD loan", () => {
  it("valid update -> 200, persists all three", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ user_id: UID, loan_id: "c1", loan_type: "CREDIT_CARD" }],
    });
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { loan_id: "c1", loan_type: "CREDIT_CARD", issuer: "ICICI", credit_limit_paise: 200000, payment_due_day: 10 },
    });
    const res = await route(
      evt("PUT", "/loans/c1", { issuer: "ICICI", credit_limit_paise: 200000, payment_due_day: 10 }),
      UID
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.issuer, "ICICI");
    assert.equal(body.credit_limit_paise, 200000);
    assert.equal(body.payment_due_day, 10);

    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    assert.equal(fieldWrite(input, "issuer").value, "ICICI");
    assert.equal(fieldWrite(input, "credit_limit_paise").value, 200000);
    assert.equal(fieldWrite(input, "payment_due_day").value, 10);
  });
});

describe("PARTIAL update without loan_type", () => {
  it("setting a card field on a stored HOME loan -> 400, no write happens", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ user_id: UID, loan_id: "h1", loan_type: "HOME" }],
    });
    const res = await route(evt("PUT", "/loans/h1", { credit_limit_paise: 100000 }), UID);
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error.details.credit_limit_paise);
    assert.equal(ddbMock.commandCalls(UpdateCommand).length, 0);
  });

  it("setting a card field on a stored CREDIT_CARD loan -> 200 (no loan_type gating error)", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ user_id: UID, loan_id: "c1b", loan_type: "CREDIT_CARD" }],
    });
    ddbMock.on(UpdateCommand).resolves({ Attributes: { loan_id: "c1b", payment_due_day: 15 } });
    const res = await route(evt("PUT", "/loans/c1b", { payment_due_day: 15 }), UID);
    assert.equal(res.statusCode, 200);
  });
});

describe("switching a CREDIT_CARD loan to another type", () => {
  it("HOME switch clears issuer, credit_limit_paise, payment_due_day in the actual write", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          user_id: UID,
          loan_id: "c2",
          loan_type: "CREDIT_CARD",
          issuer: "SBI",
          credit_limit_paise: 300000,
          payment_due_day: 20,
        },
      ],
    });
    ddbMock.on(UpdateCommand).resolves({ Attributes: { loan_id: "c2", loan_type: "HOME" } });
    const res = await route(evt("PUT", "/loans/c2", { loan_type: "HOME" }), UID);
    assert.equal(res.statusCode, 200);

    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    assert.equal(fieldWrite(input, "loan_type").value, "HOME");
    const issuerWrite = fieldWrite(input, "issuer");
    const limitWrite = fieldWrite(input, "credit_limit_paise");
    const dayWrite = fieldWrite(input, "payment_due_day");
    assert.equal(issuerWrite.present, true, "issuer must be explicitly cleared in the write");
    assert.equal(issuerWrite.value, null);
    assert.equal(limitWrite.present, true, "credit_limit_paise must be explicitly cleared");
    assert.equal(limitWrite.value, null);
    assert.equal(dayWrite.present, true, "payment_due_day must be explicitly cleared");
    assert.equal(dayWrite.value, null);
  });

  it("switching a non-card loan type to another non-card type never touches card fields", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ user_id: UID, loan_id: "h2", loan_type: "HOME" }],
    });
    ddbMock.on(UpdateCommand).resolves({ Attributes: { loan_id: "h2", loan_type: "CAR" } });
    const res = await route(evt("PUT", "/loans/h2", { loan_type: "CAR" }), UID);
    assert.equal(res.statusCode, 200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    assert.equal(fieldWrite(input, "issuer").present, false);
    assert.equal(fieldWrite(input, "credit_limit_paise").present, false);
    assert.equal(fieldWrite(input, "payment_due_day").present, false);
  });
});

describe("ownership / not-found on every update path", () => {
  it("unknown loan_id -> 404 on an ordinary (non-card) field update", async () => {
    ddbMock.on(UpdateCommand).rejects(condFail());
    const res = await route(evt("PUT", "/loans/unknown", { annual_rate: 0.1 }), UID);
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error.code, "NOT_FOUND");
  });

  it("unknown loan_id -> 404 on a card-fields-only update (never reaches the write)", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const res = await route(evt("PUT", "/loans/unknown", { credit_limit_paise: 100000 }), UID);
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error.code, "NOT_FOUND");
    assert.equal(ddbMock.commandCalls(UpdateCommand).length, 0);
  });

  it("another user's loan_id -> 404 on a card-fields-only update", async () => {
    // A real Query is partitioned by this user's own user_id, so another user's
    // row is never returned here even if the id string happens to match.
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const res = await route(evt("PUT", "/loans/someone-elses-id", { issuer: "Bank" }), UID);
    assert.equal(res.statusCode, 404);
  });

  it("another user's loan_id -> 404 on a type-switch-away update", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const res = await route(evt("PUT", "/loans/someone-elses-id", { loan_type: "HOME" }), UID);
    assert.equal(res.statusCode, 404);
  });

  it("another user's loan_id -> 404 via ConditionalCheckFailedException on an ordinary update", async () => {
    ddbMock.on(UpdateCommand).rejects(condFail());
    const res = await route(evt("PUT", "/loans/someone-elses-id", { name: "Renamed" }), UID);
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error.code, "NOT_FOUND");
  });
});

describe("backward compatibility", () => {
  it("a stored loan with no card metadata updates normally; no card keys in the write", async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { loan_id: "h9", name: "Updated" } });
    const res = await route(evt("PUT", "/loans/h9", { name: "Updated" }), UID);
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).name, "Updated");

    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    assert.equal(fieldWrite(input, "issuer").present, false);
    assert.equal(fieldWrite(input, "credit_limit_paise").present, false);
    assert.equal(fieldWrite(input, "payment_due_day").present, false);
    // No card fields and no loan_type in the body -> no need to look up the stored type.
    assert.equal(ddbMock.commandCalls(QueryCommand).length, 0);
  });
});

describe("explicit null clears a card field", () => {
  it("null issuer on a CREDIT_CARD loan -> 200, write sets issuer to null (not 400)", async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { loan_id: "c3", issuer: null } });
    const res = await route(evt("PUT", "/loans/c3", { issuer: null }), UID);
    assert.equal(res.statusCode, 200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    const w = fieldWrite(input, "issuer");
    assert.equal(w.present, true);
    assert.equal(w.value, null);
  });

  it("null credit_limit_paise and payment_due_day together -> 200, both written as null", async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { loan_id: "c4" } });
    const res = await route(
      evt("PUT", "/loans/c4", { credit_limit_paise: null, payment_due_day: null }),
      UID
    );
    assert.equal(res.statusCode, 200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    assert.equal(fieldWrite(input, "credit_limit_paise").value, null);
    assert.equal(fieldWrite(input, "payment_due_day").value, null);
  });
});

describe("monthly_emi_paise on GET /loans", () => {
  it("appears on every item: correct value when computable, null when not", async () => {
    const wellFormed = {
      user_id: UID,
      loan_id: "l1",
      principal_paise: 500000000,
      annual_rate: 0.085,
      tenure_months: 240,
    };
    const noTenure = { user_id: UID, loan_id: "l2", principal_paise: 100000, annual_rate: 0.08 };
    const noRate = { user_id: UID, loan_id: "l3", principal_paise: 100000, tenure_months: 12 };
    const noPrincipal = { user_id: UID, loan_id: "l4", annual_rate: 0.08, tenure_months: 12 };

    ddbMock.on(QueryCommand).resolves({ Items: [wellFormed, noTenure, noRate, noPrincipal] });
    const res = await route(evt("GET", "/loans"), UID);
    assert.equal(res.statusCode, 200);
    const items = JSON.parse(res.body);
    assert.equal(items.length, 4);

    assert.equal(items[0].monthly_emi_paise, monthlyEmiPaise(wellFormed));
    assert.ok(Number.isInteger(items[0].monthly_emi_paise) && items[0].monthly_emi_paise > 0);
    assert.equal(items[1].monthly_emi_paise, null, "missing tenure_months");
    assert.equal(items[2].monthly_emi_paise, null, "missing annual_rate");
    assert.equal(items[3].monthly_emi_paise, null, "missing principal/outstanding");
  });

  it("is rejected as an unknown field on POST", async () => {
    const res = await route(
      evt(
        "POST",
        "/loans",
        Object.assign(cardLoanBody(), { monthly_emi_paise: 5000 })
      ),
      UID
    );
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error.details.monthly_emi_paise);
  });

  it("is rejected as an unknown field on PUT", async () => {
    const res = await route(evt("PUT", "/loans/l1", { monthly_emi_paise: 5000 }), UID);
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error.details.monthly_emi_paise);
  });
});
