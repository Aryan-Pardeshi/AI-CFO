function rupees(paise) {
  return Number(paise || 0) / 100;
}

function monthLabel(value) {
  const [year, month] = String(value).split('-').map(Number);
  if (!year || !month) return value;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1] || value} ${year}`;
}

export function mapCashflowSummary(summary = {}) {
  const totals = summary.totals || {};
  const points = (summary.months || []).map((point) => ({
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
