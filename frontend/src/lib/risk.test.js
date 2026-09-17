import { describe, expect, test } from 'vitest';
import { scoreRiskAnswers, suggestRiskProfile } from './risk.js';

describe('risk quiz scoring', () => {
  test('minimum 1,1,1,1 -> 4 -> CONSERVATIVE', () => {
    expect(scoreRiskAnswers([1, 1, 1, 1])).toBe(4);
    expect(suggestRiskProfile(4)).toBe('CONSERVATIVE');
  });
  test('6 -> CONSERVATIVE boundary', () => {
    expect(suggestRiskProfile(6)).toBe('CONSERVATIVE');
  });
  test('7 -> MODERATE boundary', () => {
    expect(scoreRiskAnswers([2, 2, 2, 1])).toBe(7);
    expect(suggestRiskProfile(7)).toBe('MODERATE');
  });
  test('9 -> MODERATE boundary', () => {
    expect(suggestRiskProfile(9)).toBe('MODERATE');
  });
  test('10 -> AGGRESSIVE boundary', () => {
    expect(scoreRiskAnswers([3, 3, 2, 2])).toBe(10);
    expect(suggestRiskProfile(10)).toBe('AGGRESSIVE');
  });
  test('maximum 3,3,3,3 -> 12 -> AGGRESSIVE', () => {
    expect(scoreRiskAnswers([3, 3, 3, 3])).toBe(12);
    expect(suggestRiskProfile(12)).toBe('AGGRESSIVE');
  });
  test('invalid answer throws', () => {
    expect(() => scoreRiskAnswers([0, 2, 2, 2])).toThrow();
    expect(() => scoreRiskAnswers([1, 2, 3])).toThrow();
  });
});
