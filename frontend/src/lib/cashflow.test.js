import { describe, expect, test } from 'vitest';
import {
  categoryLabel,
  formatCategoryBreakdown,
  getDefaultMonth,
  getMonthOptions,
  mapCashflowSummary,
  monthLabel,
  selectMonthCashflow,
  summarizeLoanEmis,
} from './cashflow.js';

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
});

const twoMonthSummary = {
  months: [
    {
      month: '2026-07',
      income_paise: 8000000,
      expense_paise: 4000000,
      net_paise: 4000000,
      categories: [
        { category: 'RENT', income_paise: 0, expense_paise: 2500000, net_paise: -2500000 },
        { category: 'GROCERIES', income_paise: 0, expense_paise: 1500000, net_paise: -1500000 },
      ],
    },
    {
      month: '2026-08',
      income_paise: 8500000,
      expense_paise: 5000000,
      net_paise: 3500000,
      categories: [
        { category: 'RENT', income_paise: 0, expense_paise: 2500000, net_paise: -2500000 },
        { category: null, income_paise: 0, expense_paise: 2500000, net_paise: -2500000 },
      ],
    },
  ],
  totals: { income_paise: 16500000, expense_paise: 9000000, net_paise: 7500000 },
};

describe('getMonthOptions / getDefaultMonth', () => {
  test('lists months with display labels in API order', () => {
    expect(getMonthOptions(twoMonthSummary)).toEqual([
      { value: '2026-07', label: 'Jul 2026' },
      { value: '2026-08', label: 'Aug 2026' },
    ]);
  });

  test('defaults to the most recent month', () => {
    expect(getDefaultMonth(twoMonthSummary)).toBe('2026-08');
  });

  test('empty summary has no options and no default month', () => {
    expect(getMonthOptions({ months: [] })).toEqual([]);
    expect(getDefaultMonth({ months: [] })).toBe('');
    expect(getDefaultMonth({})).toBe('');
  });
});

describe('selectMonthCashflow', () => {
  test('totals for a selected month match the paise fixture exactly', () => {
    expect(selectMonthCashflow(twoMonthSummary, '2026-07')).toEqual({
      month: '2026-07',
      income_paise: 8000000,
      expense_paise: 4000000,
      net_paise: 4000000,
      categories: [
        { category: 'RENT', income_paise: 0, expense_paise: 2500000, net_paise: -2500000 },
        { category: 'GROCERIES', income_paise: 0, expense_paise: 1500000, net_paise: -1500000 },
      ],
    });
  });

  test('switching the selected month switches the returned figures', () => {
    const july = selectMonthCashflow(twoMonthSummary, '2026-07');
    const august = selectMonthCashflow(twoMonthSummary, '2026-08');
    expect(july.income_paise).toBe(8000000);
    expect(august.income_paise).toBe(8500000);
    expect(july).not.toEqual(august);
  });

  test('unknown month returns null, never fabricated figures', () => {
    expect(selectMonthCashflow(twoMonthSummary, '2099-01')).toBeNull();
    expect(selectMonthCashflow({}, '2026-07')).toBeNull();
  });
});

describe('categoryLabel', () => {
  test('formats a stored category into a readable label', () => {
    expect(categoryLabel('FOOD_DELIVERY')).toBe('Food Delivery');
    expect(categoryLabel('RENT')).toBe('Rent');
  });

  test('null category is labelled Uncategorized, never invented as a stored value', () => {
    expect(categoryLabel(null)).toBe('Uncategorized');
    expect(categoryLabel(undefined)).toBe('Uncategorized');
  });
});

describe('formatCategoryBreakdown — paise precision', () => {
  test('renders exact rupee strings for edge-case paise amounts with no floating-point drift', () => {
    const rows = formatCategoryBreakdown([
      { category: 'RENT', income_paise: 1, expense_paise: 0, net_paise: 1 },
      { category: 'GROCERIES', income_paise: 0, expense_paise: 99, net_paise: -99 },
      { category: 'EDUCATION', income_paise: 100000001, expense_paise: 0, net_paise: 100000001 },
      { category: null, income_paise: 0, expense_paise: 0, net_paise: 0 },
    ]);

    expect(rows).toEqual([
      { category: 'RENT', label: 'Rent', income: '₹0.01', expense: '₹0.00', net: '₹0.01' },
      { category: 'GROCERIES', label: 'Groceries', income: '₹0.00', expense: '₹0.99', net: '-₹0.99' },
      { category: 'EDUCATION', label: 'Education', income: '₹10,00,000.01', expense: '₹0.00', net: '₹10,00,000.01' },
      { category: null, label: 'Uncategorized', income: '₹0.00', expense: '₹0.00', net: '₹0.00' },
    ]);

    // The classic 0.1 + 0.2 float class of error must never surface: every
    // formatted string is an exact 2-decimal rupee amount, not a long tail.
    for (const row of rows) {
      expect(row.income).not.toMatch(/\.\d{3,}/);
      expect(row.expense).not.toMatch(/\.\d{3,}/);
      expect(row.net).not.toMatch(/\.\d{3,}/);
    }
  });

  test('defaults to an empty list when the API sent no categories', () => {
    expect(formatCategoryBreakdown()).toEqual([]);
    expect(formatCategoryBreakdown(undefined)).toEqual([]);
  });
});

describe('summarizeLoanEmis', () => {
  test('sums known EMIs exactly and counts how many were known', () => {
    const loans = [
      { loan_id: 'l1', monthly_emi_paise: 1000000 },
      { loan_id: 'l2', monthly_emi_paise: 2500000 },
      { loan_id: 'l3', monthly_emi_paise: 3300000 },
    ];
    expect(summarizeLoanEmis(loans)).toEqual({ totalPaise: 6800000, knownCount: 3, totalCount: 3 });
  });

  test('excludes a null EMI from the total instead of treating it as zero', () => {
    const loans = [
      { loan_id: 'l1', monthly_emi_paise: 1000000 },
      { loan_id: 'l2', monthly_emi_paise: null },
    ];
    expect(summarizeLoanEmis(loans)).toEqual({ totalPaise: 1000000, knownCount: 1, totalCount: 2 });
  });

  test('all-null loans produce a zero-known total, never a fabricated sum', () => {
    const loans = [
      { loan_id: 'l1', monthly_emi_paise: null },
      { loan_id: 'l2', monthly_emi_paise: null },
    ];
    expect(summarizeLoanEmis(loans)).toEqual({ totalPaise: 0, knownCount: 0, totalCount: 2 });
  });

  test('empty loan list', () => {
    expect(summarizeLoanEmis([])).toEqual({ totalPaise: 0, knownCount: 0, totalCount: 0 });
    expect(summarizeLoanEmis()).toEqual({ totalPaise: 0, knownCount: 0, totalCount: 0 });
  });
});

describe('monthLabel', () => {
  test('formats a YYYY-MM month key', () => {
    expect(monthLabel('2026-01')).toBe('Jan 2026');
    expect(monthLabel('2026-12')).toBe('Dec 2026');
  });
});
