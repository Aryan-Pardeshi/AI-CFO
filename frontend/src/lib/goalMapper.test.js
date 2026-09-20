import { describe, expect, test } from 'vitest';
import { contributionDeltaPaise, createGoalPayload, mapGoalToMilestone, targetAgeFromDate } from './goalMapper.js';

describe('goal mapper', () => {
  test('converts rupee strings to canonical paise without floating point drift', () => {
    expect(createGoalPayload({
      title: 'Emergency fund',
      targetRupees: '1,00,000.10',
      currentSavedRupees: '0.10',
      targetDate: '2030-04-15',
      dateOfBirth: '1995-04-16',
    })).toEqual({
      name: 'Emergency fund',
      goal_type: 'OTHER',
      amount_today_paise: 10000010,
      current_saved_paise: 10,
      target_age: 34,
      target_date: '2030-04-15',
    });
  });

  test('rejects missing or invalid DOB instead of inventing target age', () => {
    expect(() => targetAgeFromDate('2030-04-15', null)).toThrow(/date of birth/i);
    expect(() => targetAgeFromDate('2030-04-15', 'not-a-date')).toThrow(/date of birth/i);
    expect(() => targetAgeFromDate('2030-02-30', '1995-04-16')).toThrow(/target date/i);
  });

  test('maps legacy goals without saved progress or target date honestly', () => {
    expect(mapGoalToMilestone({
      goal_id: 'g1',
      name: 'Old goal',
      amount_today_paise: 500000,
      target_age: 40,
    })).toMatchObject({
      id: 'g1',
      title: 'Old goal',
      target: 5000,
      current: 0,
      deadline: 'Target age 40',
    });
  });

  test('contribution math stays in integer paise', () => {
    expect(contributionDeltaPaise(10000, '0.10')).toEqual({ deltaPaise: 10, nextSavedPaise: 10010 });
    expect(contributionDeltaPaise(0, '19.99')).toEqual({ deltaPaise: 1999, nextSavedPaise: 1999 });
  });

  test('contribution rejects zero, negative, and imprecise input', () => {
    expect(() => contributionDeltaPaise(100, '0')).toThrow(/positive/);
    expect(() => contributionDeltaPaise(100, '-5')).toThrow();
    expect(() => contributionDeltaPaise(100, '1.005')).toThrow();
    expect(() => contributionDeltaPaise(null, '10')).toThrow(/refresh/);
  });

  test('contribution rejects every untrustworthy shape for current saved paise', () => {
    // Number(x) coerces every one of these to a plausible-looking finite value (usually 0),
    // which is exactly the bug: a missing/corrupt current_saved_paise must never be treated
    // as a real zero. Only a genuine `number` that is a non-negative safe integer is trusted.
    const rejectedValues = [
      null,
      undefined,
      '',
      '   ',
      '0',
      '100',
      '19.99',
      true,
      false,
      [],
      {},
      NaN,
      Infinity,
      -Infinity,
      10.5,
      -0.5,
      -1,
      -100,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MAX_SAFE_INTEGER * 2,
    ];
    for (const value of rejectedValues) {
      expect(() => contributionDeltaPaise(value, '10')).toThrow(/refresh/);
    }
  });

  test('a legitimate zero current saved amount is not collateral damage of the fix', () => {
    expect(contributionDeltaPaise(0, '19.99')).toEqual({ deltaPaise: 1999, nextSavedPaise: 1999 });
  });

  test('overflow guard fires at the Number.MAX_SAFE_INTEGER boundary', () => {
    expect(Number.isSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(() => contributionDeltaPaise(Number.MAX_SAFE_INTEGER, '0.01')).toThrow(/maximum/);
  });
});
