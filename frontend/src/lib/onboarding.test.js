import { describe, expect, test } from 'vitest';
import {
  buildFdPayload,
  buildGoalPayload,
  buildHoldingPayload,
  buildLoanPayload,
  fdHoldingSync,
  fractionToPercent,
  goalDefaultName,
  goalRowSync,
  holdingRowSync,
  loanRowSync,
  paiseToRupees,
  percentToFraction,
} from './onboarding.js';

describe('goalDefaultName', () => {
  test('HOUSE_DOWN_PAYMENT -> "House down payment"', () => {
    expect(goalDefaultName('HOUSE_DOWN_PAYMENT')).toBe('House down payment');
  });
  test('every known type has a non-blank label', () => {
    for (const t of ['CAR', 'WEDDING', 'HOUSE_DOWN_PAYMENT', 'EDUCATION', 'TRAVEL', 'OTHER']) {
      expect(goalDefaultName(t).trim()).not.toBe('');
    }
  });
  test('unknown type falls back', () => {
    expect(goalDefaultName('NOPE').trim()).not.toBe('');
  });
});

describe('percentToFraction / fractionToPercent', () => {
  test('8.5 -> 0.085', () => {
    expect(percentToFraction(8.5)).toBe(0.085);
  });
  test('10 -> 0.1', () => {
    expect(percentToFraction(10)).toBe(0.1);
  });
  test('7.25 -> 0.0725', () => {
    expect(percentToFraction(7.25)).toBe(0.0725);
  });
  test('0.1 -> 10 (reverse)', () => {
    expect(fractionToPercent(0.1)).toBe(10);
  });
});

describe('paiseToRupees', () => {
  test('8000000 paise -> "80000"', () => {
    expect(paiseToRupees(8000000)).toBe('80000');
  });
  test('15025 paise -> "150.25"', () => {
    expect(paiseToRupees(15025)).toBe('150.25');
  });
  test('null/undefined -> empty string', () => {
    expect(paiseToRupees(null)).toBe('');
    expect(paiseToRupees(undefined)).toBe('');
  });
});

describe('holdingRowSync', () => {
  const blank = { symbol: '', name: '', quantity: '', buyPrice: '' };
  test('untouched row -> skip', () => {
    expect(holdingRowSync(blank)).toBe('skip');
  });
  test('touched row without server_id -> create', () => {
    expect(holdingRowSync({ ...blank, symbol: 'RELIANCE' })).toBe('create');
  });
  test('touched row with server_id -> update', () => {
    expect(holdingRowSync({ ...blank, symbol: 'RELIANCE', server_id: 'holding-1' })).toBe('update');
  });
});

describe('loanRowSync', () => {
  const blank = { name: '', principal: '', outstanding: '' };
  test('untouched row -> skip', () => {
    expect(loanRowSync(blank)).toBe('skip');
  });
  test('named row without server_id -> create', () => {
    expect(loanRowSync({ ...blank, name: 'Home loan' })).toBe('create');
  });
  test('row with server_id -> update', () => {
    expect(loanRowSync({ ...blank, name: 'Home loan', server_id: 'loan-1' })).toBe('update');
  });
});

describe('goalRowSync', () => {
  test('default-named row with no amount -> skip', () => {
    expect(goalRowSync({ name: 'House down payment', amount: '', target_age: '' })).toBe('skip');
  });
  test('row with amount -> create', () => {
    expect(goalRowSync({ name: 'House down payment', amount: '5000000', target_age: '60' })).toBe('create');
  });
  test('saved row with amount -> update, never re-create', () => {
    expect(goalRowSync({ name: 'House down payment', amount: '5000000', target_age: '60', server_id: 'goal-1' })).toBe('update');
  });
});

describe('fdHoldingSync', () => {
  test('no id + amount -> create once', () => {
    expect(fdHoldingSync({ serverId: null, paise: 50000000 })).toBe('create');
  });
  test('id + changed amount -> update', () => {
    expect(fdHoldingSync({ serverId: 'holding-9', paise: 60000000 })).toBe('update');
  });
  test('id + cleared amount -> delete', () => {
    expect(fdHoldingSync({ serverId: 'holding-9', paise: 0 })).toBe('delete');
  });
  test('no id + no amount -> skip', () => {
    expect(fdHoldingSync({ serverId: null, paise: 0 })).toBe('skip');
  });
});

describe('payload builders carry backend-required fields', () => {
  test('holding payload has asset_type + name + quantity', () => {
    const p = buildHoldingPayload({ assetType: 'STOCK', symbol: 'RELIANCE', name: 'Reliance', quantity: 10, avgBuyPricePaise: 150025 });
    expect(p.asset_type).toBe('STOCK');
    expect(p.name).toBe('Reliance');
    expect(p.quantity).toBe(10);
  });
  test('FD payload has fd_principal_paise', () => {
    expect(buildFdPayload(50000000).fd_principal_paise).toBe(50000000);
  });
  test('goal payload has name, goal_type, amount_today_paise, target_age', () => {
    const p = buildGoalPayload({ name: 'House down payment', goalType: 'HOUSE_DOWN_PAYMENT', amountPaise: 500000000, targetAge: 60, inflationRate: 0.06 });
    expect(p).toMatchObject({ name: 'House down payment', goal_type: 'HOUSE_DOWN_PAYMENT', amount_today_paise: 500000000, target_age: 60 });
  });
  test('loan payload has name, loan_type, outstanding_paise, annual_rate, tenure_months', () => {
    const p = buildLoanPayload({ loanType: 'HOME', name: 'Home loan', principalPaise: 500000000, outstandingPaise: 420000000, annualRate: 8.5, tenureMonths: 240, startDate: '2020-01-01', rateType: 'FIXED' });
    expect(p).toMatchObject({ name: 'Home loan', loan_type: 'HOME', outstanding_paise: 420000000, annual_rate: 8.5, tenure_months: 240 });
  });
});
