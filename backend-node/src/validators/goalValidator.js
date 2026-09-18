"use strict";

const {
  GOAL_TYPES,
  isPlainObject,
  checkUnknown,
  requireField,
  checkString,
  checkEnum,
  checkPaise,
  checkDate,
  checkSafeInt,
  checkNumber,
  calcAge,
  MAX_PAISE_10CR,
  fail,
  sanitized,
} = require("./common");

const GOAL_FIELDS = new Set([
  "name",
  "goal_type",
  "amount_today_paise",
  "current_saved_paise",
  "target_age",
  "target_date",
  "inflation_rate",
  "priority",
]);

function validateGoal(body, userDobStr, opts = {}) {
  const errors = [];
  const details = {};
  if (!isPlainObject(body)) {
    return { errors: ["body"], details: { body: "must be a JSON object" }, value: null };
  }
  // Allow validateGoal(body, { requireCreate: true }) without dob.
  if (userDobStr !== null && userDobStr !== undefined && typeof userDobStr === "object") {
    opts = userDobStr;
    userDobStr = null;
  }
  checkUnknown(body, GOAL_FIELDS, errors, details);

  if (opts.requireCreate) {
    requireField(body, "name", errors, details);
    requireField(body, "goal_type", errors, details);
    requireField(body, "amount_today_paise", errors, details);
    requireField(body, "target_age", errors, details);
  }

  checkString(body.name, "name", errors, details, { max: 200 });
  checkEnum(body.goal_type, "goal_type", errors, details, GOAL_TYPES);
  checkPaise(body.amount_today_paise, "amount_today_paise", errors, details);
  checkPaise(body.current_saved_paise, "current_saved_paise", errors, details, { max: MAX_PAISE_10CR });
  checkSafeInt(body.target_age, "target_age", errors, details);
  checkDate(body.target_date, "target_date", errors, details);
  checkNumber(body.inflation_rate, "inflation_rate", errors, details);
  checkSafeInt(body.priority, "priority", errors, details, { nullable: true });

  // target_age: current age+1..91 when dob known, else 1..91.
  if (body.target_age !== undefined && body.target_age !== null && !details.target_age) {
    let min = 1;
    if (userDobStr) min = calcAge(userDobStr) + 1;
    if (body.target_age < min || body.target_age > 91) {
      fail(errors, details, "target_age", `must be ${min}..91`);
    }
  }

  const value = sanitized(body, GOAL_FIELDS);
  return { errors, details, value };
}

function applyGoalDefaults(value) {
  if (value.inflation_rate === undefined) {
    value.inflation_rate = value.goal_type === "EDUCATION" ? 0.1 : 0.06;
  }
  return value;
}

module.exports = { validateGoal, applyGoalDefaults, GOAL_FIELDS };
