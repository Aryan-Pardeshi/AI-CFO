import { describe, expect, test } from 'vitest';
import { deriveLatestMonthAutofill } from './statementsAutofill.js';

describe('deriveLatestMonthAutofill', () => {
  test('uses only the newest month and maps every supported debit category', () => {
    const result = deriveLatestMonthAutofill([
      { txn_date: '2026-08-30', direction: 'CREDIT', category: 'INCOME', amount_paise: 7500000, balance_paise: 8100000 },
      { txn_date: '2026-09-01', direction: 'CREDIT', category: 'INCOME', amount_paise: 8500000, balance_paise: 9000000 },
      { txn_date: '2026-09-02', direction: 'DEBIT', category: 'RENT', amount_paise: 100, balance_paise: 8999900 },
      { txn_date: '2026-09-03', direction: 'DEBIT', category: 'GROCERIES', amount_paise: 200, balance_paise: 8999700 },
      { txn_date: '2026-09-04', direction: 'DEBIT', category: 'FOOD_DELIVERY', amount_paise: 300, balance_paise: 8999400 },
      { txn_date: '2026-09-05', direction: 'DEBIT', category: 'DINING', amount_paise: 400, balance_paise: 8999000 },
      { txn_date: '2026-09-06', direction: 'DEBIT', category: 'TRANSPORT', amount_paise: 500, balance_paise: 8998500 },
      { txn_date: '2026-09-07', direction: 'DEBIT', category: 'UTILITIES', amount_paise: 600, balance_paise: 8997900 },
      { txn_date: '2026-09-08', direction: 'DEBIT', category: 'SUBSCRIPTIONS', amount_paise: 700, balance_paise: 8997200 },
      { txn_date: '2026-09-09', direction: 'DEBIT', category: 'SHOPPING', amount_paise: 800, balance_paise: 8996400 },
      { txn_date: '2026-09-10', direction: 'DEBIT', category: 'HEALTH', amount_paise: 900, balance_paise: 8995500 },
      { txn_date: '2026-09-11', direction: 'DEBIT', category: 'EDUCATION', amount_paise: 1000, balance_paise: 8994500 },
      { txn_date: '2026-09-12', direction: 'DEBIT', category: 'ENTERTAINMENT', amount_paise: 1100, balance_paise: 8993400 },
      { txn_date: '2026-09-13', direction: 'DEBIT', category: 'OTHER', amount_paise: 1200, balance_paise: 8992200 },
      { txn_date: '2026-09-14', direction: 'DEBIT', category: 'INVESTMENTS', amount_paise: 1300, balance_paise: 8990900 },
      { txn_date: '2026-09-15', direction: 'DEBIT', category: 'EMI', amount_paise: 1400, balance_paise: 8989500 },
      { txn_date: '2026-09-16', direction: 'DEBIT', category: 'TRANSFER', amount_paise: 1500, balance_paise: 8988000 },
      { txn_date: '2026-09-17', direction: 'DEBIT', category: 'INSURANCE', amount_paise: 1600, balance_paise: 8986400 },
    ]);

    expect(result).toEqual({
      month: '2026-09',
      income_paise: 8500000,
      expenses_paise: {
        rent: 100,
        food: 900,
        transportation: 500,
        utilities: 600,
        subscriptions: 700,
        shopping: 800,
        healthcare: 900,
        education: 1000,
        entertainment: 1100,
        miscellaneous: 1200,
      },
      monthly_investment_paise: 1300,
      current_balance_paise: 8986400,
    });
  });

  test('uses the last API review row with a balance on the latest transaction date', () => {
    const result = deriveLatestMonthAutofill([
      { txn_date: '2026-09-30', direction: 'DEBIT', category: 'OTHER', amount_paise: 100, balance_paise: 9100 },
      { txn_date: '2026-09-01', direction: 'CREDIT', category: 'INCOME', amount_paise: 10000, balance_paise: 10000 },
      { txn_date: '2026-09-30', direction: 'DEBIT', category: 'OTHER', amount_paise: 100, balance_paise: 9000 },
      { txn_date: '2026-09-29', direction: 'DEBIT', category: 'OTHER', amount_paise: 100, balance_paise: null },
    ]);

    expect(result.current_balance_paise).toBe(9000);
    expect(result.expenses_paise.miscellaneous).toBe(300);
  });

  test('returns a null current balance when the newest month has no integer balances', () => {
    const result = deriveLatestMonthAutofill([
      { txn_date: '2026-09-01', direction: 'CREDIT', category: 'INCOME', amount_paise: 10000, balance_paise: null },
      { txn_date: '2026-09-02', direction: 'DEBIT', category: 'OTHER', amount_paise: 100, balance_paise: undefined },
    ]);

    expect(result.current_balance_paise).toBeNull();
  });

  test('returns null when no API review rows are available', () => {
    expect(deriveLatestMonthAutofill([])).toBeNull();
  });
});
