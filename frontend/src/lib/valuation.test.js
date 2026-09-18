import { describe, expect, test } from 'vitest';
import { derivePortfolioValuation } from './valuation.js';

describe('portfolio valuation truth states', () => {
  test('does not use buy price as a live quote', () => {
    const result = derivePortfolioValuation([
      { ticker: 'AAA', buyPrice: '100', quantity: '2' },
    ], {});

    expect(result.quoteState).toBe('unavailable');
    expect(result.rows[0].livePrice).toBeNull();
    expect(result.totalCurrentValue).toBeNull();
    expect(result.totalPnl).toBeNull();
    expect(result.bestPerformer).toBeNull();
  });

  test('calculates complete values only from live quotes', () => {
    const result = derivePortfolioValuation([
      { ticker: 'AAA', buyPrice: '100', quantity: '2' },
      { ticker: 'BBB', buyPrice: '50', quantity: '4' },
    ], { AAA: 125, BBB: 40 });

    expect(result.quoteState).toBe('complete');
    expect(result.totalCurrentValue).toBe(410);
    expect(result.totalPnl).toBe(10);
    expect(result.bestPerformer).toEqual({ ticker: 'AAA', returnPct: 25 });
  });

  test('calculates partial P&L only for quoted positions and marks the state partial', () => {
    const result = derivePortfolioValuation([
      { ticker: 'AAA', buyPrice: '100', quantity: '2' },
      { ticker: 'BBB', buyPrice: '50', quantity: '4' },
    ], { AAA: 125 });

    expect(result.quoteState).toBe('partial');
    expect(result.totalCurrentValue).toBe(250);
    expect(result.totalPnl).toBe(50);
    expect(result.rows[1].livePrice).toBeNull();
    expect(result.bestPerformer).toEqual({ ticker: 'AAA', returnPct: 25 });
  });
});
