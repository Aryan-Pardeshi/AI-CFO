"use strict";

const {
  ASSET_TYPES,
  HOLDING_SOURCES,
  FD_TYPES,
  isPlainObject,
  fail,
  checkUnknown,
  requireField,
  checkEnum,
  checkString,
  checkNumber,
  checkPaise,
  checkDate,
  sanitized,
} = require("./common");

const HOLDING_FIELDS = new Set([
  "asset_type",
  "source",
  "instrument_key",
  "symbol",
  "isin",
  "name",
  "quantity",
  "avg_buy_price_paise",
  "first_buy_date",
  "manual_current_value_paise",
  "sector",
  "sip_monthly_paise",
  "fd_type",
  "fd_principal_paise",
  "fd_annual_rate",
  "fd_start_date",
  "fd_maturity_date",
]);

const QUANTITY_REQUIRED_TYPES = new Set(["STOCK", "ETF", "MUTUAL_FUND", "CRYPTO"]);

function validateHolding(body, opts = {}) {
  const errors = [];
  const details = {};
  if (!isPlainObject(body)) {
    return { errors: ["body"], details: { body: "must be a JSON object" }, value: null };
  }
  checkUnknown(body, HOLDING_FIELDS, errors, details);

  if (opts.requireCreate) {
    requireField(body, "asset_type", errors, details);
    requireField(body, "name", errors, details);
    if (body.asset_type === "FD") {
      requireField(body, "fd_principal_paise", errors, details);
    } else if (QUANTITY_REQUIRED_TYPES.has(body.asset_type)) {
      requireField(body, "quantity", errors, details);
    }
  }

  checkEnum(body.asset_type, "asset_type", errors, details, ASSET_TYPES);
  checkEnum(body.source, "source", errors, details, HOLDING_SOURCES);
  checkString(body.instrument_key, "instrument_key", errors, details, {
    nullable: true,
    max: 100,
  });
  checkString(body.symbol, "symbol", errors, details, { nullable: true, max: 100 });
  checkString(body.isin, "isin", errors, details, { nullable: true, max: 100 });
  checkString(body.name, "name", errors, details, { max: 200 });
  checkNumber(body.quantity, "quantity", errors, details, { nullable: true });
  if (
    body.quantity !== undefined &&
    body.quantity !== null &&
    !details.quantity &&
    typeof body.quantity === "number" &&
    body.quantity <= 0
  ) {
    fail(errors, details, "quantity", "must be > 0");
  }
  checkPaise(body.avg_buy_price_paise, "avg_buy_price_paise", errors, details, { nullable: true });
  checkDate(body.first_buy_date, "first_buy_date", errors, details, { nullable: true });
  checkPaise(body.manual_current_value_paise, "manual_current_value_paise", errors, details, {
    nullable: true,
  });
  checkString(body.sector, "sector", errors, details, { nullable: true, max: 100 });
  checkPaise(body.sip_monthly_paise, "sip_monthly_paise", errors, details, { nullable: true });
  checkEnum(body.fd_type, "fd_type", errors, details, FD_TYPES, { nullable: true });
  checkPaise(body.fd_principal_paise, "fd_principal_paise", errors, details, { nullable: true });
  checkNumber(body.fd_annual_rate, "fd_annual_rate", errors, details, {
    nullable: true,
    min: 0,
    max: 0.36,
  });
  checkDate(body.fd_start_date, "fd_start_date", errors, details, { nullable: true });
  checkDate(body.fd_maturity_date, "fd_maturity_date", errors, details, { nullable: true });

  const value = sanitized(body, HOLDING_FIELDS);
  if (opts.requireCreate && value.source === undefined) value.source = "MANUAL";
  return { errors, details, value };
}

module.exports = { validateHolding, HOLDING_FIELDS, QUANTITY_REQUIRED_TYPES };
