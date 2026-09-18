"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { monthlyEmiPaise } = require("../src/services/emi");

// finance-rules.md: EMI = P * i * (1+i)^n / ((1+i)^n - 1), i = annual_rate / 12
describe("monthlyEmiPaise", () => {
  it("matches the locked reducing-balance formula", () => {
    const emi = monthlyEmiPaise({ principal_paise: 500000000, annual_rate: 0.085, tenure_months: 240 });
    // Rs 50,00,000 at 8.5% for 20 years is about Rs 43,391 a month.
    assert.ok(Math.abs(emi - 4339116) <= 100, `got ${emi}`);
    assert.ok(Number.isInteger(emi));
  });

  it("is principal divided by tenure at a zero rate", () => {
    assert.equal(monthlyEmiPaise({ principal_paise: 1200000, annual_rate: 0, tenure_months: 12 }), 100000);
  });

  it("agrees with an independent annuity computation across typical loans", () => {
    for (const [principal, rate, months] of [[100000000, 0.1, 60], [2500000, 0.36, 12], [900000000, 0.07, 360]]) {
      const i = rate / 12;
      const expected = (principal * i) / (1 - Math.pow(1 + i, -months));
      assert.ok(Math.abs(monthlyEmiPaise({ principal_paise: principal, annual_rate: rate, tenure_months: months }) - expected) <= 1);
    }
  });

  it("is null when the loan cannot produce an EMI", () => {
    assert.equal(monthlyEmiPaise({ principal_paise: 0, annual_rate: 0.08, tenure_months: 12 }), null);
    assert.equal(monthlyEmiPaise({ principal_paise: 100000, annual_rate: 0.08, tenure_months: 0 }), null);
    assert.equal(monthlyEmiPaise({ principal_paise: -5, annual_rate: 0.08, tenure_months: 12 }), null);
    assert.equal(monthlyEmiPaise({ principal_paise: 100000, annual_rate: -0.1, tenure_months: 12 }), null);
    assert.equal(monthlyEmiPaise({ principal_paise: "abc", annual_rate: 0.08, tenure_months: 12 }), null);
    assert.equal(monthlyEmiPaise({}), null);
    assert.equal(monthlyEmiPaise(null), null);
  });

  it("falls back to outstanding when the original principal is missing", () => {
    const emi = monthlyEmiPaise({ outstanding_paise: 1200000, annual_rate: 0, tenure_months: 12 });
    assert.equal(emi, 100000);
  });
});
