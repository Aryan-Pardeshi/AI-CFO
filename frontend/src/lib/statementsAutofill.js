const EXPENSE_FIELD_BY_CATEGORY = {
  RENT: 'rent',
  GROCERIES: 'food',
  FOOD_DELIVERY: 'food',
  DINING: 'food',
  TRANSPORT: 'transportation',
  UTILITIES: 'utilities',
  SUBSCRIPTIONS: 'subscriptions',
  SHOPPING: 'shopping',
  HEALTH: 'healthcare',
  EDUCATION: 'education',
  ENTERTAINMENT: 'entertainment',
  OTHER: 'miscellaneous',
};

const EMPTY_EXPENSES = {
  rent: 0,
  food: 0,
  transportation: 0,
  utilities: 0,
  subscriptions: 0,
  shopping: 0,
  healthcare: 0,
  education: 0,
  entertainment: 0,
  miscellaneous: 0,
};

function statementMonth(row) {
  return typeof row?.txn_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.txn_date)
    ? row.txn_date.slice(0, 7)
    : null;
}

export function deriveLatestMonthAutofill(rows) {
  if (!Array.isArray(rows)) return null;
  const months = rows.map(statementMonth).filter(Boolean);
  if (months.length === 0) return null;

  const month = months.sort().at(-1);
  const expenses_paise = { ...EMPTY_EXPENSES };
  let income_paise = 0;
  let monthly_investment_paise = 0;
  let current_balance_paise = null;
  let latestBalanceDate = null;

  for (const row of rows) {
    if (statementMonth(row) !== month || !Number.isInteger(row.amount_paise)) continue;
    const amount = row.amount_paise;
    if (row.direction === 'CREDIT' && row.category === 'INCOME') {
      income_paise += amount;
    }
    if (row.direction === 'DEBIT') {
      if (row.category === 'INVESTMENTS') {
        monthly_investment_paise += amount;
      }
      const expenseField = EXPENSE_FIELD_BY_CATEGORY[row.category];
      if (expenseField) expenses_paise[expenseField] += amount;
    }
    if (Number.isInteger(row.balance_paise) && (!latestBalanceDate || row.txn_date >= latestBalanceDate)) {
      latestBalanceDate = row.txn_date;
      current_balance_paise = row.balance_paise;
    }
  }

  return { month, income_paise, expenses_paise, monthly_investment_paise, current_balance_paise };
}
