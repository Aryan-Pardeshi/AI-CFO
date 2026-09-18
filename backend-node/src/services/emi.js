"use strict";

// finance-rules.md (locked): EMI = P * i * (1+i)^n / ((1+i)^n - 1), i = annual_rate / 12.
// Money is integer paise; annual_rate is a decimal fraction (0.085 = 8.5%).
function monthlyEmiPaise(loan) {
  if (!loan || typeof loan !== "object") return null;
  const principal = Number.isFinite(loan.principal_paise) ? loan.principal_paise : loan.outstanding_paise;
  const rate = loan.annual_rate;
  const months = loan.tenure_months;
  if (!Number.isFinite(principal) || principal <= 0) return null;
  if (!Number.isFinite(rate) || rate < 0) return null;
  if (!Number.isInteger(months) || months <= 0) return null;
  const monthlyRate = rate / 12;
  const emi = monthlyRate === 0
    ? principal / months
    : (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return Number.isFinite(emi) ? Math.round(emi) : null;
}

module.exports = { monthlyEmiPaise };
