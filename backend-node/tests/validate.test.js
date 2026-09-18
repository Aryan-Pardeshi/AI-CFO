"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_PAISE_10CR,
  calcAge,
  parseBody,
} = require("../src/validators/common");
const { validateProfile } = require("../src/validators/profileValidator");
const { validateHolding } = require("../src/validators/holdingValidator");
const { validateGoal, applyGoalDefaults } = require("../src/validators/goalValidator");
const { validateLoan, applyLoanDefaults } = require("../src/validators/loanValidator");

function dobForAge(age) {
  const now = new Date();
  const y = now.getUTCFullYear() - age;
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

describe("checkPaise semantics (via monthly_income_paise)", () => {
  it("rejects negative", () => {
    const r = validateProfile({ monthly_income_paise: -1 });
    assert.ok(r.errors.includes("monthly_income_paise"));
    assert.ok(r.details.monthly_income_paise);
  });

  it("rejects non-integer (float) where integer required", () => {
    const r = validateProfile({ monthly_income_paise: 10.5 });
    assert.ok(r.errors.includes("monthly_income_paise"));
  });

  it("rejects non-number (string)", () => {
    const r = validateProfile({ monthly_income_paise: "100" });
    assert.ok(r.errors.includes("monthly_income_paise"));
  });

  it("rejects values over MAX_PAISE_10CR, accepts boundary", () => {
    assert.equal(MAX_PAISE_10CR, 10000000000);
    const over = validateProfile({ monthly_income_paise: MAX_PAISE_10CR + 1 });
    assert.ok(over.errors.includes("monthly_income_paise"));
    const at = validateProfile({ monthly_income_paise: MAX_PAISE_10CR });
    assert.ok(!at.errors.includes("monthly_income_paise"));
  });

  it("accepts zero", () => {
    const r = validateProfile({ monthly_income_paise: 0 });
    assert.ok(!r.errors.includes("monthly_income_paise"));
  });
});

describe("checkSafeInt semantics (via emergency_fund_target_months / risk_score)", () => {
  it("rejects negative below min", () => {
    const r = validateProfile({ emergency_fund_target_months: -1 });
    assert.ok(r.errors.includes("emergency_fund_target_months"));
  });

  it("rejects non-integer (float) where integer required", () => {
    const r = validateProfile({ emergency_fund_target_months: 1.5 });
    assert.ok(r.errors.includes("emergency_fund_target_months"));
    const r2 = validateProfile({ risk_score: 8.5 });
    assert.ok(r2.errors.includes("risk_score"));
  });

  it("rejects non-number (string)", () => {
    const r = validateProfile({ emergency_fund_target_months: "2" });
    assert.ok(r.errors.includes("emergency_fund_target_months"));
  });

  it("rejects values over max", () => {
    const r = validateProfile({ emergency_fund_target_months: 25 });
    assert.ok(r.errors.includes("emergency_fund_target_months"));
    const ok = validateProfile({ emergency_fund_target_months: 24 });
    assert.ok(!ok.errors.includes("emergency_fund_target_months"));
  });
});

describe("checkNumber semantics (via annual_rate / inflation_rate)", () => {
  it("rejects negative below min", () => {
    const r = validateLoan({ annual_rate: -0.01 });
    assert.ok(r.errors.includes("annual_rate"));
  });

  it("rejects non-number (string)", () => {
    const r = validateLoan({ annual_rate: "0.08" });
    assert.ok(r.errors.includes("annual_rate"));
  });

  it("rejects NaN and Infinity", () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      const r = validateLoan({ annual_rate: v });
      assert.ok(r.errors.includes("annual_rate"), `expected reject for ${v}`);
    }
  });

  it("rejects values over max 0.36", () => {
    const r = validateLoan({ annual_rate: 0.361 });
    assert.ok(r.errors.includes("annual_rate"));
  });

  it("accepts decimal fractions including boundary 0.36", () => {
    for (const v of [0, 0.085, 0.36]) {
      const r = validateLoan({ annual_rate: v });
      assert.ok(!r.errors.includes("annual_rate"), `expected accept for ${v}`);
    }
  });
});

describe("validateProfile date_of_birth age bounds", () => {
  for (const age of [17, 81]) {
    it(`rejects age ${age}`, () => {
      const dob = dobForAge(age);
      assert.equal(calcAge(dob), age);
      const r = validateProfile({ date_of_birth: dob });
      assert.ok(r.errors.includes("date_of_birth"), `dob ${dob}`);
      assert.match(r.details.date_of_birth, /18\.\.80/);
    });
  }
  for (const age of [18, 80]) {
    it(`accepts age ${age}`, () => {
      const dob = dobForAge(age);
      assert.equal(calcAge(dob), age);
      const r = validateProfile({ date_of_birth: dob });
      assert.ok(!r.errors.includes("date_of_birth"), `dob ${dob}`);
    });
  }
});

describe("validateProfile risk_score consistency", () => {
  it("rejects mismatch between risk_score and sum of risk_answers", () => {
    const r = validateProfile({ risk_answers: [1, 1, 1, 1], risk_score: 8 });
    assert.ok(r.errors.includes("risk_score"));
  });

  it("passes when risk_score equals sum", () => {
    const r = validateProfile({ risk_answers: [1, 2, 2, 3], risk_score: 8 });
    assert.equal(r.errors.length, 0);
  });

  it("fine with risk_answers alone (no risk_score)", () => {
    const r = validateProfile({ risk_answers: [1, 1, 1, 1] });
    assert.ok(!r.errors.includes("risk_score"));
    assert.ok(!r.errors.includes("risk_answers"));
  });

  it("fine with risk_score alone (no risk_answers)", () => {
    const r = validateProfile({ risk_score: 8 });
    assert.ok(!r.errors.includes("risk_score"));
  });
});

describe("validateProfile unknown field", () => {
  it("rejects unknown top-level field naming it", () => {
    const r = validateProfile({ nope_field: 1 });
    assert.ok(r.errors.includes("nope_field"));
    assert.equal(r.details.nope_field, "unknown field");
  });
});

describe("validateHolding quantity", () => {
  it("rejects quantity 0", () => {
    const r = validateHolding({ quantity: 0 });
    assert.ok(r.errors.includes("quantity"));
  });

  it("rejects negative quantity", () => {
    const r = validateHolding({ quantity: -2 });
    assert.ok(r.errors.includes("quantity"));
  });

  it("accepts positive quantity (int and float)", () => {
    for (const q of [1, 1.5]) {
      const r = validateHolding({ quantity: q });
      assert.ok(!r.errors.includes("quantity"), `q=${q}`);
    }
  });
});

describe("validateHolding create requirements", () => {
  it("FD requires fd_principal_paise on create", () => {
    const r = validateHolding({ asset_type: "FD", name: "My FD" }, { requireCreate: true });
    assert.ok(r.errors.includes("fd_principal_paise"));
  });

  for (const t of ["STOCK", "ETF", "MUTUAL_FUND", "CRYPTO"]) {
    it(`${t} requires quantity on create`, () => {
      const r = validateHolding({ asset_type: t, name: "X" }, { requireCreate: true });
      assert.ok(r.errors.includes("quantity"));
    });
  }

  it("CASH without quantity passes on create", () => {
    const r = validateHolding({ asset_type: "CASH", name: "Cash" }, { requireCreate: true });
    assert.ok(!r.errors.includes("quantity"));
  });

  it("source defaults to MANUAL when omitted on create", () => {
    const r = validateHolding(
      { asset_type: "STOCK", name: "X", quantity: 1 },
      { requireCreate: true }
    );
    assert.equal(r.errors.length, 0);
    assert.equal(r.value.source, "MANUAL");
  });

  it("explicit source preserved on create", () => {
    const r = validateHolding(
      { asset_type: "STOCK", name: "X", quantity: 1, source: "UPSTOX" },
      { requireCreate: true }
    );
    assert.equal(r.value.source, "UPSTOX");
  });

  it("no source default on update (non-create)", () => {
    const r = validateHolding({ name: "X" });
    assert.equal(r.value.source, undefined);
  });
});

describe("validateGoal target_age bounds", () => {
  it("with DOB known: rejects below current_age+1", () => {
    const dob = dobForAge(30);
    const min = calcAge(dob) + 1;
    const r = validateGoal(
      { name: "G", goal_type: "CAR", amount_today_paise: 100, target_age: min - 1 },
      dob,
      { requireCreate: true }
    );
    assert.ok(r.errors.includes("target_age"));
  });

  it("with DOB known: accepts min and 91, rejects 92", () => {
    const dob = dobForAge(30);
    const min = calcAge(dob) + 1;
    assert.ok(!validateGoal({ target_age: min }, dob).errors.includes("target_age"));
    assert.ok(!validateGoal({ target_age: 91 }, dob).errors.includes("target_age"));
    assert.ok(validateGoal({ target_age: 92 }, dob).errors.includes("target_age"));
  });

  it("without DOB: bounds are 1..91", () => {
    assert.ok(validateGoal({ target_age: 1 }, null).errors.length === 0 || !validateGoal({ target_age: 1 }, null).errors.includes("target_age"));
    assert.ok(!validateGoal({ target_age: 91 }, null).errors.includes("target_age"));
    assert.ok(validateGoal({ target_age: 0 }, null).errors.includes("target_age"));
    assert.ok(validateGoal({ target_age: 92 }, null).errors.includes("target_age"));
  });

  it("without DOB arg at all (opts-only overload) defaults to 1..91", () => {
    assert.ok(!validateGoal({ target_age: 30 }, { requireCreate: false }).errors.includes("target_age"));
    assert.ok(validateGoal({ target_age: 0 }, { requireCreate: true }).errors.includes("target_age"));
  });
});

describe("applyGoalDefaults", () => {
  it("sets 0.10 for EDUCATION when omitted", () => {
    const out = applyGoalDefaults({ goal_type: "EDUCATION" });
    assert.equal(out.inflation_rate, 0.1);
  });

  it("sets 0.06 otherwise when omitted", () => {
    for (const t of ["CAR", "HOUSE_DOWN_PAYMENT", "OTHER", undefined]) {
      const out = applyGoalDefaults(t === undefined ? {} : { goal_type: t });
      assert.equal(out.inflation_rate, 0.06, `type=${t}`);
    }
  });

  it("preserves explicit inflation_rate", () => {
    assert.equal(applyGoalDefaults({ goal_type: "EDUCATION", inflation_rate: 0.05 }).inflation_rate, 0.05);
    assert.equal(applyGoalDefaults({ goal_type: "CAR", inflation_rate: 0.12 }).inflation_rate, 0.12);
  });
});

describe("validateLoan bounds", () => {
  for (const t of [0, 481]) {
    it(`rejects tenure_months ${t}`, () => {
      const r = validateLoan({ tenure_months: t });
      assert.ok(r.errors.includes("tenure_months"));
    });
  }
  for (const t of [1, 480]) {
    it(`accepts tenure_months ${t}`, () => {
      const r = validateLoan({ tenure_months: t });
      assert.ok(!r.errors.includes("tenure_months"));
    });
  }

  it("accepts annual_rate 0.36", () => {
    assert.ok(!validateLoan({ annual_rate: 0.36 }).errors.includes("annual_rate"));
  });

  it("rejects annual_rate above 0.36", () => {
    for (const v of [0.361, 8.5]) {
      const r = validateLoan({ annual_rate: v });
      assert.ok(r.errors.includes("annual_rate"), `v=${v}`);
    }
  });
});

describe("applyLoanDefaults", () => {
  it("sets prepayment_charge_pct 0 when omitted", () => {
    assert.equal(applyLoanDefaults({}).prepayment_charge_pct, 0);
  });

  it("preserves explicit prepayment_charge_pct", () => {
    assert.equal(applyLoanDefaults({ prepayment_charge_pct: 2 }).prepayment_charge_pct, 2);
  });
});

describe("sanitized / ignored id fields", () => {
  it("validateHolding drops user_id/holding_id silently", () => {
    const r = validateHolding({
      asset_type: "STOCK",
      name: "X",
      quantity: 1,
      user_id: "spoof",
      holding_id: "spoof-h",
    });
    assert.equal(r.errors.length, 0);
    assert.ok(!("user_id" in r.value));
    assert.ok(!("holding_id" in r.value));
  });

  it("validateGoal drops user_id/goal_id silently", () => {
    const r = validateGoal(
      { name: "G", goal_type: "CAR", amount_today_paise: 100, target_age: 30, user_id: "s", goal_id: "s" },
      null
    );
    assert.ok(!r.errors.includes("user_id"));
    assert.ok(!r.errors.includes("goal_id"));
    assert.ok(!("user_id" in r.value));
    assert.ok(!("goal_id" in r.value));
  });

  it("validateLoan drops user_id/loan_id silently", () => {
    const r = validateLoan({
      name: "L",
      loan_type: "HOME",
      outstanding_paise: 10,
      annual_rate: 0.08,
      tenure_months: 12,
      user_id: "s",
      loan_id: "s",
    });
    assert.ok(!r.errors.includes("user_id"));
    assert.ok(!r.errors.includes("loan_id"));
    assert.ok(!("user_id" in r.value));
    assert.ok(!("loan_id" in r.value));
  });

  it("validateProfile drops user_id silently", () => {
    const r = validateProfile({ name: "A", user_id: "spoof" });
    assert.ok(!r.errors.includes("user_id"));
    assert.ok(!("user_id" in r.value));
  });

  it("cross ids (goal_id in holding, loan_id in goal) also dropped, not unknown", () => {
    const h = validateHolding({ asset_type: "CASH", name: "C", goal_id: "x", loan_id: "y" });
    assert.ok(!h.errors.includes("goal_id"));
    assert.ok(!h.errors.includes("loan_id"));
    const g = validateGoal({ name: "G", holding_id: "x", loan_id: "y" }, null);
    assert.ok(!g.errors.includes("holding_id"));
    assert.ok(!g.errors.includes("loan_id"));
  });
});

describe("parseBody", () => {
  it("empty/missing body -> {}", () => {
    assert.deepEqual(parseBody({}), { ok: true, body: {} });
    assert.deepEqual(parseBody({ body: "" }), { ok: true, body: {} });
    assert.deepEqual(parseBody({ body: null }), { ok: true, body: {} });
  });

  it("plain object body passes through", () => {
    assert.deepEqual(parseBody({ body: { a: 1 } }), { ok: true, body: { a: 1 } });
  });

  it("invalid JSON string fails", () => {
    assert.equal(parseBody({ body: "{bad" }).ok, false);
  });

  it("JSON array string fails (not a plain object)", () => {
    assert.equal(parseBody({ body: "[]" }).ok, false);
  });

  it("JSON string literal fails", () => {
    assert.equal(parseBody({ body: '"hi"' }).ok, false);
  });

  it("non-string non-object body fails", () => {
    assert.equal(parseBody({ body: 42 }).ok, false);
    assert.equal(parseBody({ body: ["a"] }).ok, false);
  });
});
