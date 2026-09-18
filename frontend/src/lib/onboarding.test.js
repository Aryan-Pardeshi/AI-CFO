import { describe, expect, test } from 'vitest';
import {
  buildFdPayload,
  buildGoalPayload,
  buildHoldingPayload,
  buildLoanPayload,
  ageFromDob,
  fdHoldingSync,
  fractionToPercent,
  goalDefaultName,
  goalRowSync,
  holdingRowSync,
  loanRowSync,
  mapHoldingRows,
  paiseToRupees,
  percentToFraction,
  deserializeStep3Draft,
  serializeStep3Draft,
  parseRupeesField,
} from './onboarding.js';

describe('ageFromDob', () => {
  test('null input -> null', () => {
    expect(ageFromDob(null)).toBeNull();
  });

  test('normal date returns the current age', () => {
    const now = new Date();
    const dob = new Date(now.getFullYear() - 30, now.getMonth(), now.getDate());
    expect(ageFromDob(`${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}`)).toBe(30);
  });
});

describe('parseRupeesField', () => {
  test('blank required value returns an error', () => {
    expect(parseRupeesField('Amount', '')).toEqual({ error: 'Amount is required' });
  });

  test('blank optional value returns empty', () => {
    expect(parseRupeesField('Amount', '', { required: false })).toEqual({ paise: 0, empty: true });
  });

  test('invalid input returns an error', () => {
    expect(parseRupeesField('Amount', 'not-a-number')).toEqual({ error: 'Amount must be a valid amount with up to 2 decimals' });
  });

  test('value over the 10 crore cap returns an error', () => {
    expect(parseRupeesField('Amount', '100000001')).toEqual({ error: 'Amount must be between ₹0 and ₹10 crore' });
  });

  test('valid value returns paise', () => {
    expect(parseRupeesField('Amount', '1500.25')).toEqual({ paise: 150025 });
  });
});

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

describe('mapHoldingRows', () => {
  test('maps the FD and non-FD holdings into step-4 form rows', () => {
    expect(mapHoldingRows([
      {
        asset_type: 'FD',
        fd_principal_paise: 30000000,
        holding_id: 'fd-1',
      },
      {
        asset_type: 'STOCK',
        symbol: 'RELIANCE',
        name: 'Reliance Industries',
        quantity: 30,
        avg_buy_price_paise: 1800000,
        holding_id: 'holding-1',
      },
    ])).toEqual({
      fdAmount: '300000',
      fdServerId: 'fd-1',
      holdings: [{
        id: 'srv-holding-1',
        server_id: 'holding-1',
        asset_type: 'STOCK',
        symbol: 'RELIANCE',
        name: 'Reliance Industries',
        quantity: '30',
        buyPrice: '18000',
        valueOnly: false,
        currentValue: '',
      }],
    });
  });

  test('restores a manual current value as a value-only row', () => {
    expect(mapHoldingRows([{
      asset_type: 'OTHER',
      symbol: 'OLD-FUND',
      name: 'Inherited fund',
      quantity: 1,
      avg_buy_price_paise: 275000,
      manual_current_value_paise: 275000,
      holding_id: 'holding-2',
    }]).holdings).toEqual([{
      id: 'srv-holding-2',
      server_id: 'holding-2',
      asset_type: 'OTHER',
      symbol: 'OLD-FUND',
      name: 'Inherited fund',
      quantity: '1',
      buyPrice: '2750',
      valueOnly: true,
      currentValue: '2750',
    }]);
  });
});

describe('step 3 draft serialization', () => {
  const draft = {
    incomes: { job: '80000', business: '', rental: '12000', dividend: '', freelance: '' },
    expenses: { rent: '20000', food: '10000', transportation: '', utilities: '', insurance: '', subscriptions: '', shopping: '', healthcare: '', education: '', entertainment: '', miscellaneous: '' },
    cashParts: { current: '45000', savings: '200000', cash: '15000' },
  };

  test('round-trips the itemized step 3 fields', () => {
    expect(deserializeStep3Draft(serializeStep3Draft(draft))).toEqual(draft);
  });

  test('rejects malformed or incomplete drafts', () => {
    expect(deserializeStep3Draft('not json')).toBeNull();
    expect(deserializeStep3Draft(JSON.stringify({ incomes: draft.incomes }))).toBeNull();
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
    expect(p.avg_buy_price_paise).toBe(150025);
  });
  test('value-only holding payload sets quantity, cost basis, and manual value', () => {
    const p = buildHoldingPayload({
      assetType: 'OTHER',
      symbol: 'OLD-FUND',
      name: 'Inherited fund',
      quantity: 1,
      avgBuyPricePaise: 275000,
      manualCurrentValuePaise: 275000,
    });
    expect(p).toMatchObject({
      quantity: 1,
      avg_buy_price_paise: 275000,
      manual_current_value_paise: 275000,
    });
  });
  test('FD payload has fd_principal_paise', () => {
    expect(buildFdPayload(50000000).fd_principal_paise).toBe(50000000);
  });
  test('holding and FD payloads leave source to the server so an update never relabels a DEMO row', () => {
    const holding = buildHoldingPayload({ assetType: 'STOCK', symbol: 'RELIANCE', name: 'Reliance', quantity: 30, avgBuyPricePaise: 1800000 });
    expect(holding).not.toHaveProperty('source');
    expect(buildFdPayload(30000000)).not.toHaveProperty('source');
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
