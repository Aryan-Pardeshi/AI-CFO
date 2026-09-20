import { authenticatedRequest } from './api.js';

/**
 * Search Indian stocks and ETFs.
 * GET /securities/search?q=...
 */
export async function searchSecurities(query, { signal } = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return { results: [] };
  }
  return authenticatedRequest(`/securities/search?q=${encodeURIComponent(q)}`, {
    method: 'GET',
    signal,
  });
}

/**
 * Get security detail, real quote, performance, fundamentals, and holding info.
 * GET /securities/detail?instrument_key=...
 */
export async function getSecurityDetail(instrumentKey, { signal } = {}) {
  if (!instrumentKey) {
    throw new Error('instrumentKey is required');
  }
  return authenticatedRequest(`/securities/detail?instrument_key=${encodeURIComponent(instrumentKey)}`, {
    method: 'GET',
    signal,
  });
}

/**
 * Get historical candle data for supported periods (1d, 3d, 1m, 6m, 1y, 3y, 5y).
 * GET /securities/history?instrument_key=...&period=...
 */
export async function getSecurityHistory(instrumentKey, period = '1y', { signal } = {}) {
  if (!instrumentKey) {
    throw new Error('instrumentKey is required');
  }
  return authenticatedRequest(
    `/securities/history?instrument_key=${encodeURIComponent(instrumentKey)}&period=${encodeURIComponent(period)}`,
    {
      method: 'GET',
      signal,
    },
  );
}

/**
 * Assess educational portfolio fit of adding an illustrative amount to a security.
 * GET /securities/fit?instrument_key=...&add_amount_paise=...
 */
export async function getSecurityFit(instrumentKey, addAmountPaise, { signal } = {}) {
  if (!instrumentKey) {
    throw new Error('instrumentKey is required');
  }
  if (!Number.isInteger(addAmountPaise) || addAmountPaise <= 0) {
    throw new Error('addAmountPaise must be a positive integer in paise');
  }
  return authenticatedRequest(
    `/securities/fit?instrument_key=${encodeURIComponent(instrumentKey)}&add_amount_paise=${encodeURIComponent(
      addAmountPaise,
    )}`,
    {
      method: 'GET',
      signal,
    },
  );
}
