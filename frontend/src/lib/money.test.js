import { describe, expect, test } from 'vitest';
import { formatPaise, rupeesToPaise } from './money.js';

describe('rupeesToPaise', () => {
  test('"0.1" -> 10', () => {
    expect(rupeesToPaise('0.1')).toBe(10);
  });
  test('"150.25" -> 15025', () => {
    expect(rupeesToPaise('150.25')).toBe(15025);
  });
  test('"1,00,000" -> 10000000', () => {
    expect(rupeesToPaise('1,00,000')).toBe(10000000);
  });
  test('"19.99" -> 1999', () => {
    expect(rupeesToPaise('19.99')).toBe(1999);
  });
  test('"1.005" throws', () => {
    expect(() => rupeesToPaise('1.005')).toThrow();
  });
  test('"-5" throws', () => {
    expect(() => rupeesToPaise('-5')).toThrow();
  });
  test('empty throws', () => {
    expect(() => rupeesToPaise('')).toThrow();
  });
  test('non-numeric throws', () => {
    expect(() => rupeesToPaise('abc')).toThrow();
  });
  test('whole rupees', () => {
    expect(rupeesToPaise('100')).toBe(10000);
  });
  test('numeric input', () => {
    expect(rupeesToPaise(150.25)).toBe(15025);
  });
});

describe('formatPaise', () => {
  test('formats Indian rupees', () => {
    expect(formatPaise(10000000)).toContain('1,00,000');
  });
});
