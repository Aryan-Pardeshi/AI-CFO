import { authenticatedRequest } from './api.js';

function tickerQuery(tickers) {
  const values = Array.isArray(tickers) ? tickers.filter(Boolean) : [];
  return values.length > 0 ? `&tickers=${encodeURIComponent(values.join(','))}` : '';
}

export function getDashboardProfile() {
  return authenticatedRequest('/dashboard/profile');
}

export function saveDashboardFinancials(financials) {
  return authenticatedRequest('/dashboard/financials', {
    method: 'PUT',
    body: { financials },
  });
}

export function getPortfolioPrices(tickers = []) {
  return authenticatedRequest(`/portfolio/prices${tickerQuery(tickers).replace(/^&/, '?')}`);
}

export function getPortfolioNews(tickers = []) {
  return authenticatedRequest(`/portfolio/news${tickerQuery(tickers).replace(/^&/, '?')}`);
}

export function getPortfolioHistorical(range, tickers = []) {
  const rangeQuery = `?range=${encodeURIComponent(range)}`;
  return authenticatedRequest(`/portfolio/historical${rangeQuery}${tickerQuery(tickers)}`);
}

export function getPortfolioSuggestions() {
  return authenticatedRequest('/portfolio/suggestions');
}

export function getCashflowSummary() {
  return authenticatedRequest('/cashflow/summary');
}
