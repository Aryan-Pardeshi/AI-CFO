import { describe, expect, test } from 'vitest';
import { mapCashflowSummary } from './cashflow.js';

describe('cash-flow response mapping', () => {
  test('maps actual monthly paise points to rupee chart values', () => {
    expect(mapCashflowSummary({
      months: [{ month: '2026-09', income_paise: 8500000, expense_paise: 2114900, net_paise: 6385100 }],
      totals: { income_paise: 8500000, expense_paise: 2114900, net_paise: 6385100 },
    })).toEqual({
      points: [{ name: 'Sep 2026', Income: 85000, Expenses: 21149, Net: 63851 }],
      totals: { income: 85000, expenses: 21149, net: 63851 },
      hasHistory: true,
    });
  });

  test('keeps empty history honest', () => {
    expect(mapCashflowSummary({ months: [], totals: { income_paise: 0, expense_paise: 0, net_paise: 0 } })).toEqual({
      points: [],
      totals: { income: 0, expenses: 0, net: 0 },
      hasHistory: false,
    });
  });

  test('safely handles null summary without inventing financial data', () => {
    expect(mapCashflowSummary(null)).toEqual({
      points: [],
      totals: { income: 0, expenses: 0, net: 0 },
      hasHistory: false,
    });
  });
});
