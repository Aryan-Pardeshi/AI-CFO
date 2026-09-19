import { describe, expect, test } from 'vitest';
import {
  buildCandidateGoal,
  buildFireChartRows,
  formatCoverageMonths,
  formatFireAge,
  formatPaiseINR,
  formatRatePct,
  formatWithdrawalPct,
} from './fireFormat.js';

describe('formatPaiseINR (display-only, single paise→rupee conversion)', () => {
  test('converts integer paise once: 567100000 paise → ₹56,71,000', () => {
    expect(formatPaiseINR(567100000)).toContain('56,71,000');
  });

  test('zero and small values stay exact', () => {
    expect(formatPaiseINR(0)).toContain('0');
    expect(formatPaiseINR(50)).toContain('0.50');
  });

  test('rejects non-integer paise so callers cannot double-convert floats', () => {
    expect(() => formatPaiseINR(5671000.5)).toThrow();
    expect(() => formatPaiseINR('567100000')).toThrow();
    expect(() => formatPaiseINR(NaN)).toThrow();
  });

  test('does not mutate or rescale the API value', () => {
    const input = 567100000;
    formatPaiseINR(input);
    expect(input).toBe(567100000);
  });
});

describe('formatRatePct', () => {
  test('decimal fraction → percent label without touching money', () => {
    expect(formatRatePct(0.06)).toBe('6%');
    expect(formatRatePct(0.048)).toBe('4.8%');
  });

  test('null/undefined → honest unavailable message', () => {
    expect(formatRatePct(null)).toBe('Not available');
    expect(formatRatePct(undefined)).toBe('Not available');
  });
});

describe('formatWithdrawalPct (already-percent values are labelled, never rescaled)', () => {
  test('4.8 → “4.8%”, not 480%', () => {
    expect(formatWithdrawalPct(4.8)).toBe('4.8%');
  });

  test('null/undefined → honest unavailable message', () => {
    expect(formatWithdrawalPct(null)).toBe('Not available');
    expect(formatWithdrawalPct(undefined)).toBe('Not available');
  });
});

describe('formatFireAge / formatCoverageMonths', () => {
  test('null age → unavailable, real age → "Age N"', () => {
    expect(formatFireAge(null)).toBe('Not available');
    expect(formatFireAge(31)).toBe('Age 31');
  });

  test('null coverage → unavailable, real coverage → months label', () => {
    expect(formatCoverageMonths(null)).toBe('Not available');
    expect(formatCoverageMonths(undefined)).toBe('Not available');
    expect(formatCoverageMonths(3)).toContain('3');
  });
});

describe('buildFireChartRows (display shaping only, no finance math)', () => {
  const requiredCurve = [
    { age: 30, corpus_paise: 500000000 },
    { age: 31, corpus_paise: 567100000 },
    { age: 32, corpus_paise: 600000000 },
  ];
  const projectedCurve = [
    { age: 30, corpus_paise: 400000000 },
    { age: 31, corpus_paise: 570000000 },
    { age: 32, corpus_paise: 650000000 },
  ];

  test('retains both returned curves aligned by age, converted once to rupees', () => {
    const rows = buildFireChartRows(requiredCurve, projectedCurve);
    expect(rows).toEqual([
      { age: 30, required: 5000000, projected: 4000000 },
      { age: 31, required: 5671000, projected: 5700000 },
      { age: 32, required: 6000000, projected: 6500000 },
    ]);
  });

  test('keeps every age from either curve, missing side stays null (never fabricated)', () => {
    const rows = buildFireChartRows(
      [{ age: 30, corpus_paise: 500000000 }],
      [
        { age: 30, corpus_paise: 400000000 },
        { age: 31, corpus_paise: 570000000 },
      ],
    );
    expect(rows).toEqual([
      { age: 30, required: 5000000, projected: 4000000 },
      { age: 31, required: null, projected: 5700000 },
    ]);
  });

  test('empty curves → empty rows (no fake history)', () => {
    expect(buildFireChartRows([], [])).toEqual([]);
    expect(buildFireChartRows(null, undefined)).toEqual([]);
  });
});

describe('buildCandidateGoal (UI validation + whole-rupee → integer paise)', () => {
  test('whole rupees convert exactly: ₹5,00,000 → 50000000 paise', () => {
    expect(
      buildCandidateGoal({ goalType: 'CAR', amountRupees: '500000', targetAge: '35' }),
    ).toEqual({ goal_type: 'CAR', amount_today_paise: 50000000, target_age: 35 });
  });

  test('rejects non-positive amounts', () => {
    expect(() => buildCandidateGoal({ goalType: 'CAR', amountRupees: '0', targetAge: '35' })).toThrow();
    expect(() => buildCandidateGoal({ goalType: 'CAR', amountRupees: '-5', targetAge: '35' })).toThrow();
    expect(() => buildCandidateGoal({ goalType: 'CAR', amountRupees: 'abc', targetAge: '35' })).toThrow();
  });

  test('rejects non-sensible target ages', () => {
    expect(() => buildCandidateGoal({ goalType: 'CAR', amountRupees: '500000', targetAge: '17' })).toThrow();
    expect(() => buildCandidateGoal({ goalType: 'CAR', amountRupees: '500000', targetAge: '92' })).toThrow();
    expect(() => buildCandidateGoal({ goalType: 'CAR', amountRupees: '500000', targetAge: '' })).toThrow();
  });

  test('rejects missing goal type', () => {
    expect(() => buildCandidateGoal({ goalType: '', amountRupees: '500000', targetAge: '35' })).toThrow();
  });
});
