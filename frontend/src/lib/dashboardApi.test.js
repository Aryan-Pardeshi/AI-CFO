import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getDashboardProfile,
  getPortfolioHistorical,
  getPortfolioNews,
  getPortfolioPrices,
  getPortfolioSuggestions,
  saveDashboardFinancials,
} from './dashboardApi.js';
import { authenticatedRequest } from './api.js';

vi.mock('./api.js', () => ({
  authenticatedRequest: vi.fn(),
}));

describe('dashboard API adapter', () => {
  beforeEach(() => {
    authenticatedRequest.mockClear();
    authenticatedRequest.mockResolvedValue({ ok: true });
  });

  test('uses modern dashboard and portfolio paths with encoded tickers', async () => {
    const tickers = ['NSE_EQ|INE040A01034', 'TCS & Co'];

    await getDashboardProfile();
    await getPortfolioPrices(tickers);
    await getPortfolioNews(tickers);
    await getPortfolioHistorical('1y', tickers);

    expect(authenticatedRequest).toHaveBeenNthCalledWith(1, '/dashboard/profile');
    expect(authenticatedRequest).toHaveBeenNthCalledWith(
      2,
      `/portfolio/prices?tickers=${encodeURIComponent(tickers.join(','))}`,
    );
    expect(authenticatedRequest).toHaveBeenNthCalledWith(
      3,
      `/portfolio/news?tickers=${encodeURIComponent(tickers.join(','))}`,
    );
    expect(authenticatedRequest).toHaveBeenNthCalledWith(
      4,
      `/portfolio/historical?range=1y&tickers=${encodeURIComponent(tickers.join(','))}`,
    );
  });

  test('omits empty ticker query parameters', async () => {
    await getPortfolioPrices([]);
    await getPortfolioNews([]);
    await getPortfolioHistorical('1y', []);

    expect(authenticatedRequest).toHaveBeenNthCalledWith(1, '/portfolio/prices');
    expect(authenticatedRequest).toHaveBeenNthCalledWith(2, '/portfolio/news');
    expect(authenticatedRequest).toHaveBeenNthCalledWith(3, '/portfolio/historical?range=1y');
  });

  test('wraps saved financials and sends no client identity', async () => {
    const financials = { onboardingMethod: 'manual_advanced', incomes: { jobSalary: '100000' } };

    await saveDashboardFinancials(financials);

    expect(authenticatedRequest).toHaveBeenCalledWith('/dashboard/financials', {
      method: 'PUT',
      body: { financials },
    });
  });

  test('suggestions send no client-owned preference or identity query', async () => {
    await getPortfolioSuggestions();

    expect(authenticatedRequest).toHaveBeenCalledWith('/portfolio/suggestions');
  });
});
