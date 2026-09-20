/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ userEmail: 'demo@example.com' }),
}));

vi.mock('../../lib/dashboardApi.js', () => ({
  getDashboardProfile: vi.fn(),
  getPortfolioPrices: vi.fn(),
  getPortfolioHistorical: vi.fn(),
}));

// Recharts needs layout APIs jsdom lacks; stub the container so the page's
// data wiring (not the chart library internals) is what gets asserted.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children, data }) => (
    <div data-testid="balance-chart" data-chart-data={JSON.stringify(data ?? [])}>
      {children}
    </div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

import BalanceSheet from './BalanceSheet.jsx';
import { getDashboardProfile, getPortfolioHistorical, getPortfolioPrices } from '../../lib/dashboardApi.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <BalanceSheet />
    </MemoryRouter>,
  );
}

const historicalResponse = {
  range: '1M',
  data: [{ date: '2026-09-01', 'Total Portfolio': 0 }],
  availableLines: ['RELIANCE.NS'],
  source: 'Yahoo Finance',
  as_of: '2026-09-18T09:31:00Z',
};

function profileWith(overrides = {}) {
  return {
    user: {
      hasOnboarded: true,
      financials: {
        portfolio: [],
        ...overrides,
      },
    },
  };
}

describe('BalanceSheet page (real authenticated data path only, never fabricated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPortfolioHistorical.mockResolvedValue(historicalResponse);
  });

  afterEach(() => {
    cleanup();
  });

  test('renders holdings from the profile response', async () => {
    getDashboardProfile.mockResolvedValue(profileWith({
      portfolio: [
        { type: 'STOCK', ticker: 'RELIANCE.NS', buyPrice: '2500.00', quantity: '10' },
        { type: 'MUTUAL_FUND', ticker: 'PARAGPARIKH', buyPrice: '50.00', quantity: '100' },
      ],
    }));
    getPortfolioPrices.mockResolvedValue({
      prices: { 'RELIANCE.NS': 2980.25 },
      quotes: {},
      source: 'Yahoo Finance',
      as_of: '2026-09-18T09:31:00Z',
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('2 Total Positions')).toBeInTheDocument());
    const table = within(screen.getByRole('region', { name: /active holdings table/i }));
    expect(table.getByRole('cell', { name: 'RELIANCE.NS' })).toBeInTheDocument();
    expect(table.getByRole('cell', { name: 'PARAGPARIKH' })).toBeInTheDocument();
    expect(table.getByRole('cell', { name: '10' })).toBeInTheDocument();
    expect(table.getByRole('cell', { name: '₹2,500' })).toBeInTheDocument();
  });

  test('shows the real source/as_of strings from the price response', async () => {
    getDashboardProfile.mockResolvedValue(profileWith({
      portfolio: [{ type: 'STOCK', ticker: 'RELIANCE.NS', buyPrice: '2500.00', quantity: '10' }],
    }));
    getPortfolioPrices.mockResolvedValue({
      prices: { 'RELIANCE.NS': 2980.25 },
      quotes: {},
      source: 'Yahoo Finance',
      as_of: '2026-09-18T09:31:00Z',
    });

    renderPage();

    await waitFor(() => expect(screen.getByTestId('price-caption')).toBeInTheDocument());
    expect(screen.getByTestId('price-caption')).toHaveTextContent('Yahoo Finance');
    expect(screen.getByTestId('price-caption')).toHaveTextContent('2026-09-18T09:31:00Z');
    // The historical response's own source/as_of is rendered too, next to the chart it backs
    expect(screen.getByTestId('historical-caption')).toHaveTextContent('Yahoo Finance');
    // The old hardcoded prose must be gone
    expect(screen.queryByText(/Real-time multi-asset valuation powered by Yahoo Finance API\./)).not.toBeInTheDocument();
  });

  test('shows "Unavailable" when a price is missing, and a mutual fund reads as no quote source', async () => {
    getDashboardProfile.mockResolvedValue(profileWith({
      portfolio: [
        { type: 'STOCK', ticker: 'RELIANCE.NS', buyPrice: '2500.00', quantity: '10' },
        { type: 'STOCK', ticker: 'TCS.NS', buyPrice: '3000.00', quantity: '5' },
        { type: 'MUTUAL_FUND', ticker: 'PARAGPARIKH', buyPrice: '50.00', quantity: '100' },
      ],
    }));
    // Only RELIANCE.NS gets a quote back — TCS.NS silently has none, PARAGPARIKH (a fund) never will.
    getPortfolioPrices.mockResolvedValue({
      prices: { 'RELIANCE.NS': 2980.25 },
      quotes: {},
      source: 'Yahoo Finance',
      as_of: '2026-09-18T09:31:00Z',
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('3 Total Positions')).toBeInTheDocument());
    const table = within(screen.getByRole('region', { name: /active holdings table/i }));

    // Column order: Asset, Instrument Type, Quantity, Avg Buy Price, Live Market Price, P&L, Returns
    const tcsCells = within(table.getByRole('cell', { name: 'TCS.NS' }).closest('tr')).getAllByRole('cell');
    expect(tcsCells[4]).toHaveTextContent('Unavailable');
    // Never a fabricated price or cost-basis-as-market-value substitute — the buy price never leaks into the live-price cell
    expect(tcsCells[4]).not.toHaveTextContent('₹3,000.00');

    const fundCells = within(table.getByRole('cell', { name: 'PARAGPARIKH' }).closest('tr')).getAllByRole('cell');
    expect(fundCells[4]).toHaveTextContent('No quote source for this instrument');
  });

  test('shows the empty state when the portfolio is empty', async () => {
    getDashboardProfile.mockResolvedValue(profileWith({ portfolio: [] }));

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText(/No investments found in your portfolio ledger/i),
      ).toBeInTheDocument(),
    );
    expect(getPortfolioPrices).not.toHaveBeenCalled();
  });

  test('shows the error state when the profile request rejects', async () => {
    getDashboardProfile.mockRejectedValue(new Error('Unable to reach dashboard service'));

    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/Unable to reach dashboard service/i);
  });

  test('omits the cash/FD tiles when those keys are absent', async () => {
    getDashboardProfile.mockResolvedValue(profileWith({
      portfolio: [{ type: 'STOCK', ticker: 'RELIANCE.NS', buyPrice: '2500.00', quantity: '10' }],
      // no liquidAssets, no liabilities at all
    }));
    getPortfolioPrices.mockResolvedValue({
      prices: { 'RELIANCE.NS': 2980.25 },
      quotes: {},
      source: 'Yahoo Finance',
      as_of: '2026-09-18T09:31:00Z',
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('1 Total Positions')).toBeInTheDocument());
    expect(screen.queryByText('Bank Balance (Cash)')).not.toBeInTheDocument();
    expect(screen.queryByText('Fixed Deposits')).not.toBeInTheDocument();
    expect(screen.queryByText('Monthly Loan & Card Obligations')).not.toBeInTheDocument();
    // A zero must never be invented for an absent key
    expect(screen.queryByText('₹0.00')).not.toBeInTheDocument();
  });

  test('surfaces bank balance, FDs and per-type liabilities when the profile actually carries them', async () => {
    getDashboardProfile.mockResolvedValue(profileWith({
      portfolio: [{ type: 'STOCK', ticker: 'RELIANCE.NS', buyPrice: '2500.00', quantity: '10' }],
      liquidAssets: { bankBalance: '120000.50', fixedDeposits: '50000.00' },
      liabilities: { homeLoanEmi: '25000.00', creditCardDebt: '5000.00' },
    }));
    getPortfolioPrices.mockResolvedValue({
      prices: { 'RELIANCE.NS': 2980.25 },
      quotes: {},
      source: 'Yahoo Finance',
      as_of: '2026-09-18T09:31:00Z',
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Bank Balance (Cash)')).toBeInTheDocument());
    expect(screen.getByText('₹1,20,000.50')).toBeInTheDocument();
    expect(screen.getByText('Fixed Deposits')).toBeInTheDocument();
    expect(screen.getByText('₹50,000.00')).toBeInTheDocument();
    expect(screen.getByText('Monthly Loan & Card Obligations')).toBeInTheDocument();
    expect(screen.getByText('Home Loan EMI')).toBeInTheDocument();
    expect(screen.getByText('Credit Card Debt')).toBeInTheDocument();
  });
});
