import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from './api.js';
import {
  searchSecurities,
  getSecurityDetail,
  getSecurityHistory,
  getSecurityFit,
} from './securityApi.js';

vi.mock('./api.js', () => ({
  authenticatedRequest: vi.fn(),
}));

describe('securityApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchSecurities', () => {
    it('returns empty results if query is empty without making request', async () => {
      const res = await searchSecurities('');
      expect(res).toEqual({ results: [] });
      expect(api.authenticatedRequest).not.toHaveBeenCalled();

      const resWhitespace = await searchSecurities('   ');
      expect(resWhitespace).toEqual({ results: [] });
      expect(api.authenticatedRequest).not.toHaveBeenCalled();
    });

    it('calls /securities/search with encoded query', async () => {
      api.authenticatedRequest.mockResolvedValueOnce({ results: [] });
      await searchSecurities('HDFC Bank & Co');
      expect(api.authenticatedRequest).toHaveBeenCalledWith(
        '/securities/search?q=HDFC%20Bank%20%26%20Co',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('getSecurityDetail', () => {
    it('throws when instrumentKey is missing', async () => {
      await expect(getSecurityDetail('')).rejects.toThrow('instrumentKey is required');
    });

    it('calls /securities/detail with encoded instrumentKey', async () => {
      api.authenticatedRequest.mockResolvedValueOnce({ symbol: 'RELIANCE' });
      await getSecurityDetail('NSE_EQ|INE002A01018');
      expect(api.authenticatedRequest).toHaveBeenCalledWith(
        '/securities/detail?instrument_key=NSE_EQ%7CINE002A01018',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('getSecurityHistory', () => {
    it('throws when instrumentKey is missing', async () => {
      await expect(getSecurityHistory('')).rejects.toThrow('instrumentKey is required');
    });

    it('calls /securities/history with encoded instrumentKey and period', async () => {
      api.authenticatedRequest.mockResolvedValueOnce({ candles: [] });
      await getSecurityHistory('NSE_EQ|INE002A01018', '6m');
      expect(api.authenticatedRequest).toHaveBeenCalledWith(
        '/securities/history?instrument_key=NSE_EQ%7CINE002A01018&period=6m',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('getSecurityFit', () => {
    it('throws when instrumentKey or addAmountPaise is invalid', async () => {
      await expect(getSecurityFit('', 1000000)).rejects.toThrow('instrumentKey is required');
      await expect(getSecurityFit('NSE_EQ|123', 0)).rejects.toThrow(
        'addAmountPaise must be a positive integer in paise',
      );
      await expect(getSecurityFit('NSE_EQ|123', -500)).rejects.toThrow(
        'addAmountPaise must be a positive integer in paise',
      );
      await expect(getSecurityFit('NSE_EQ|123', 10.5)).rejects.toThrow(
        'addAmountPaise must be a positive integer in paise',
      );
    });

    it('calls /securities/fit with encoded parameters', async () => {
      api.authenticatedRequest.mockResolvedValueOnce({ assessment: 'POTENTIAL_FIT' });
      await getSecurityFit('NSE_EQ|INE002A01018', 2500000);
      expect(api.authenticatedRequest).toHaveBeenCalledWith(
        '/securities/fit?instrument_key=NSE_EQ%7CINE002A01018&add_amount_paise=2500000',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });
});
