import { describe, expect, test } from 'vitest';
import { createGoalPayload, mapGoalToMilestone, targetAgeFromDate } from './goalMapper.js';

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
});
