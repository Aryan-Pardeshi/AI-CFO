import { formatPaise } from './money.js';

/**
 * All money math for the cash-flow / monthly-tracker experience lives here, in
 * integer paise, exactly as returned by GET /cashflow/summary. Conversion to
 * rupees happens only inside formatPaise (money.js), at the display boundary.
 * Nothing here invents, estimates, or forecasts a figure — every value is a
 * pass-through or a straight sum of paise fields the API already computed.
 */

function rupees(paise) {
  return Number(paise || 0) / 100;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(value) {
  const [year, month] = String(value).split('-').map(Number);
  if (!year || !month) return value;
  return `${MONTH_NAMES[month - 1] || value} ${year}`;
}

/**
 * Aggregate chart-friendly view of the whole cash-flow history. Kept for the
 * all-months reference totals shown on the Monthly Tracker page (never a
 * trend/forecast line — just a labelled sum across every committed month).
 */
export function mapCashflowSummary(summary = {}) {
  const safe = summary || {};
  const totals = safe.totals || {};
  const points = (safe.months || []).map((point) => ({
    name: monthLabel(point.month),
    Income: rupees(point.income_paise),
    Expenses: rupees(point.expense_paise),
    Net: rupees(point.net_paise),
  }));
  return {
    points,
    totals: {
      income: rupees(totals.income_paise),
      expenses: rupees(totals.expense_paise),
      net: rupees(totals.net_paise),
    },
    hasHistory: points.length > 0,
  };
}

/**
 * Options for a month selector, in the order the API returns them (ascending,
 * per statements/summaries.py), each carrying its display label.
 */
export function getMonthOptions(summary = {}) {
  return (Array.isArray(summary.months) ? summary.months : []).map((point) => ({
    value: point.month,
    label: monthLabel(point.month),
  }));
}

/** Most recent committed month, or '' when there is no committed history. */
export function getDefaultMonth(summary = {}) {
  const months = Array.isArray(summary.months) ? summary.months : [];
  return months.length > 0 ? months[months.length - 1].month : '';
}

/**
 * Pick out one month's figures exactly as the API returned them (integer
 * paise, categories already sorted server-side) — no arithmetic, just
 * selection. Returns null when the month isn't present in the summary.
 */
export function selectMonthCashflow(summary = {}, monthValue) {
  const months = Array.isArray(summary.months) ? summary.months : [];
  const found = months.find((entry) => entry.month === monthValue);
  if (!found) return null;
  return {
    month: found.month,
    income_paise: found.income_paise ?? 0,
    expense_paise: found.expense_paise ?? 0,
    net_paise: found.net_paise ?? 0,
    categories: Array.isArray(found.categories) ? found.categories : [],
  };
}

/** Human-readable label for a txn_category value; null is always "Uncategorized". */
export function categoryLabel(category) {
  if (!category) return 'Uncategorized';
  return String(category)
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format a month's category buckets for display. Sort order is preserved
 * exactly as the API returned it; only the paise -> rupee-string conversion
 * happens here, via the shared formatPaise formatter.
 */
export function formatCategoryBreakdown(categories = []) {
  return (Array.isArray(categories) ? categories : []).map((entry) => ({
    category: entry.category ?? null,
    label: categoryLabel(entry.category),
    income: formatPaise(entry.income_paise ?? 0),
    expense: formatPaise(entry.expense_paise ?? 0),
    net: formatPaise(entry.net_paise ?? 0),
  }));
}

/**
 * Sum monthly_emi_paise across canonical loans. A loan with a null EMI (the
 * server couldn't derive one) is excluded from the sum, never treated as 0 —
 * knownCount/totalCount tell the caller whether the total is complete.
 */
export function summarizeLoanEmis(loans = []) {
  const list = Array.isArray(loans) ? loans : [];
  let totalPaise = 0;
  let knownCount = 0;
  for (const loan of list) {
    const emi = loan?.monthly_emi_paise;
    if (emi === null || emi === undefined) continue;
    totalPaise += emi;
    knownCount += 1;
  }
  return {
    totalPaise,
    knownCount,
    totalCount: list.length,
  };
}
