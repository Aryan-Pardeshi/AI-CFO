"use strict";

/**
 * Field validation for CrudFunction.
 * Mirrors contracts/openapi.yaml enums + .agents/modules.md "Validation bounds".
 * Every *_paise field must be a non-negative safe integer (rejects floats/strings).
 */

const MAX_PAISE_10CR = 10000000000;

const ASSET_TYPES = ["STOCK", "ETF", "MUTUAL_FUND", "FD", "CASH", "CRYPTO", "OTHER"];
const HOLDING_SOURCES = ["UPSTOX", "MANUAL", "DEMO", "IMPORTED"];
const RISK_PROFILES = ["CONSERVATIVE", "MODERATE", "AGGRESSIVE"];
const STRATEGY_GOALS = ["WEALTH_GROWTH", "INCOME", "CAPITAL_PRESERVATION", "FIRE"];
const GOAL_TYPES = ["CAR", "WEDDING", "HOUSE_DOWN_PAYMENT", "EDUCATION", "TRAVEL", "OTHER"];
const LOAN_TYPES = ["HOME", "CAR", "PERSONAL", "EDUCATION", "CREDIT_CARD", "OTHER"];
const RATE_TYPES = ["FLOATING", "FIXED"];
const FD_TYPES = ["CUMULATIVE", "PAYOUT"];

// Client-supplied ids are ignored, never written. Stripped before unknown-field checks.
const IGNORED_ID_FIELDS = new Set(["user_id", "holding_id", "goal_id", "loan_id"]);

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function fail(errors, details, field, msg) {
  errors.push(field);
  details[field] = msg;
}

function checkPaise(value, field, errors, details, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, "must be a non-negative integer (paise), not null");
    return;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(errors, details, field, "must be a non-negative safe integer (paise)");
    return;
  }
  if (opts.max !== undefined && value > opts.max) {
    fail(errors, details, field, `must be <= ${opts.max}`);
  }
  if (opts.min !== undefined && value < opts.min) {
    fail(errors, details, field, `must be >= ${opts.min}`);
  }
}

function checkSafeInt(value, field, errors, details, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, "must be an integer, not null");
    return;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    fail(errors, details, field, "must be an integer");
    return;
  }
  if (opts.max !== undefined && value > opts.max) {
    fail(errors, details, field, `must be <= ${opts.max}`);
  }
  if (opts.min !== undefined && value < opts.min) {
    fail(errors, details, field, `must be >= ${opts.min}`);
  }
}

function checkNumber(value, field, errors, details, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, "must be a number, not null");
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(errors, details, field, "must be a number");
    return;
  }
  if (opts.max !== undefined && value > opts.max) {
    fail(errors, details, field, `must be <= ${opts.max}`);
  }
  if (opts.min !== undefined && value < opts.min) {
    fail(errors, details, field, `must be >= ${opts.min}`);
  }
}

function checkString(value, field, errors, details, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, "must be a string, not null");
    return;
  }
  if (typeof value !== "string") {
    fail(errors, details, field, "must be a string");
    return;
  }
  if (opts.max !== undefined && value.length > opts.max) {
    fail(errors, details, field, `must be <= ${opts.max} characters`);
  }
  if (opts.minLength !== undefined && value.length < opts.minLength) {
    fail(errors, details, field, `must be >= ${opts.minLength} characters`);
  }
}

function requireField(body, field, errors, details) {
  const v = body[field];
  if (v === undefined || v === null || (typeof v === "string" && v === "")) {
    fail(errors, details, field, "required");
    return false;
  }
  return true;
}

function checkBoolean(value, field, errors, details) {
  if (value === undefined || value === null) {
    if (value === null) fail(errors, details, field, "must be a boolean, not null");
    return;
  }
  if (typeof value !== "boolean") fail(errors, details, field, "must be a boolean");
}

function checkEnum(value, field, errors, details, allowed, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, `must be one of ${allowed.join("|")}`);
    return;
  }
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(errors, details, field, `must be one of ${allowed.join("|")}`);
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function checkDate(value, field, errors, details, opts = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (!opts.nullable) fail(errors, details, field, "must be a YYYY-MM-DD date, not null");
    return;
  }
  if (typeof value !== "string") {
    fail(errors, details, field, "must be a YYYY-MM-DD date");
    return;
  }
  const m = DATE_RE.exec(value);
  if (!m) {
    fail(errors, details, field, "must be a YYYY-MM-DD date");
    return;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    fail(errors, details, field, "must be a valid calendar date (YYYY-MM-DD)");
  }
}

function checkDateTime(value, field, errors, details) {
  if (value === undefined || value === null) return; // nullable
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    fail(errors, details, field, "must be an ISO 8601 date-time string");
  }
}

function calcAge(dobStr, now = new Date()) {
  const parts = dobStr.split("-").map(Number);
  let age = now.getUTCFullYear() - parts[0];
  const mm = now.getUTCMonth() + 1;
  const dd = now.getUTCDate();
  if (mm < parts[1] || (mm === parts[1] && dd < parts[2])) age -= 1;
  return age;
}

function checkUnknown(body, allowed, errors, details) {
  for (const key of Object.keys(body)) {
    if (IGNORED_ID_FIELDS.has(key)) continue;
    if (!allowed.has(key)) {
      fail(errors, details, key, "unknown field");
    }
  }
}

function sanitized(body, allowed) {
  const out = {};
  for (const key of Object.keys(body)) {
    if (IGNORED_ID_FIELDS.has(key)) continue;
    if (allowed.has(key) && body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

function parseBody(event) {
  let raw = event.body;
  if (raw === undefined || raw === null || raw === "") return { ok: true, body: {} };
  if (typeof raw === "object" && !Array.isArray(raw)) return { ok: true, body: raw };
  if (typeof raw !== "string") return { ok: false, body: null };
  try {
    if (event.isBase64Encoded) {
      raw = Buffer.from(raw, "base64").toString("utf8");
    }
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return { ok: false, body: null };
    return { ok: true, body: parsed };
  } catch {
    return { ok: false, body: null };
  }
}

module.exports = {
  MAX_PAISE_10CR,
  ASSET_TYPES,
  HOLDING_SOURCES,
  RISK_PROFILES,
  STRATEGY_GOALS,
  GOAL_TYPES,
  LOAN_TYPES,
  RATE_TYPES,
  FD_TYPES,
  isPlainObject,
  fail,
  checkPaise,
  checkSafeInt,
  checkNumber,
  checkString,
  requireField,
  checkBoolean,
  checkEnum,
  checkDate,
  checkDateTime,
  calcAge,
  checkUnknown,
  sanitized,
  parseBody,
  IGNORED_ID_FIELDS,
};
