/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import Investments from './Investments.jsx';
import * as securityApi from '../../lib/securityApi.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const MOCK_SECURITIES = [
  {
    instrument_key: 'NSE_EQ|INE002A01018',
    symbol: 'RELIANCE',
    name: 'Reliance Industries Limited',
    exchange: 'NSE',
    asset_type: 'STOCK',
    sector: 'Energy',
    isin: 'INE002A01018',
    price_paise: 295050,
    day_change_paise: 3550,
    day_change_pct: 1.22,
  },
  {
    instrument_key: 'NSE_EQ|INE009A01021',
    symbol: 'INFY',
    name: 'Infosys Limited',
    exchange: 'NSE',
    asset_type: 'STOCK',
    sector: 'Information Technology',
    isin: 'INE009A01021',
    price_paise: 162000,
    day_change_paise: -1500,
    day_change_pct: -0.92,
  },
  {
    instrument_key: 'NSE_EQ|INF732E01037',
    symbol: 'NIFTYBEES',
    name: 'Nippon India Nifty 50 BeES ETF',
    exchange: 'NSE',
    asset_type: 'ETF',
    sector: 'Broad Market',
    isin: 'INF732E01037',
    price_paise: 25800,
    day_change_paise: 120,
    day_change_pct: 0.47,
  },
];

describe('Investments page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(securityApi, 'searchSecurities').mockResolvedValue({
      query: 'REL',
      results: MOCK_SECURITIES,
    });
  });

  afterEach(() => {
    cleanup();
  });

  test('renders search input, filter tabs, popular chips, and initial landing guidance', () => {
    render(
      <MemoryRouter>
        <Investments />
      </MemoryRouter>,
    );

    expect(screen.getByText('Investments & Securities')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search by symbol or name/i)).toBeInTheDocument();

    // Filter pills
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stocks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ETFs' })).toBeInTheDocument();

    // Popular chips
    expect(screen.getByRole('button', { name: 'Reliance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'HDFC Bank' })).toBeInTheDocument();

    // Landing guidance
    expect(screen.getByText('Explore Indian Equities & ETFs')).toBeInTheDocument();
  });

  test('searches and renders securities with prices and changes when query is entered', async () => {
    render(
      <MemoryRouter>
        <Investments />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText(/Search by symbol or name/i);
    fireEvent.change(searchInput, { target: { value: 'REL' } });

    await waitFor(() => {
      expect(screen.getByText('Reliance Industries Limited')).toBeInTheDocument();
      expect(screen.getByText('Infosys Limited')).toBeInTheDocument();
      expect(screen.getByText('Nippon India Nifty 50 BeES ETF')).toBeInTheDocument();
    });

    // Prices and changes rendered
    expect(screen.getByText('₹2,950.50')).toBeInTheDocument();
    expect(screen.getByText('+₹35.50 (+1.22%)')).toBeInTheDocument();
    expect(screen.getByText('₹1,620.00')).toBeInTheDocument();
    expect(screen.getByText('-₹15.00 (-0.92%)')).toBeInTheDocument();
  });

  test('clicking popular ticker button populates search and triggers searchSecurities', async () => {
    render(
      <MemoryRouter>
        <Investments />
      </MemoryRouter>,
    );

    const popularBtn = screen.getByRole('button', { name: 'Reliance' });
    fireEvent.click(popularBtn);

    await waitFor(() => {
      expect(securityApi.searchSecurities).toHaveBeenCalledWith('Reliance', expect.any(Object));
    });
  });

  test('filters results by asset type when clicking filter tabs', async () => {
    render(
      <MemoryRouter>
        <Investments />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText(/Search by symbol or name/i);
    fireEvent.change(searchInput, { target: { value: 'REL' } });

    await waitFor(() => {
      expect(screen.getByText('Reliance Industries Limited')).toBeInTheDocument();
    });

    // Click 'ETFs' filter
    fireEvent.click(screen.getByRole('button', { name: 'ETFs' }));

    // Only ETF should be visible
    expect(screen.getByText('Nippon India Nifty 50 BeES ETF')).toBeInTheDocument();
    expect(screen.queryByText('Reliance Industries Limited')).not.toBeInTheDocument();
    expect(screen.queryByText('Infosys Limited')).not.toBeInTheDocument();

    // Click 'Stocks' filter
    fireEvent.click(screen.getByRole('button', { name: 'Stocks' }));

    // Only stocks should be visible
    expect(screen.getByText('Reliance Industries Limited')).toBeInTheDocument();
    expect(screen.getByText('Infosys Limited')).toBeInTheDocument();
    expect(screen.queryByText('Nippon India Nifty 50 BeES ETF')).not.toBeInTheDocument();
  });

  test('renders security card as a Link to /securities/:instrumentKey', async () => {
    render(
      <MemoryRouter>
        <Investments />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText(/Search by symbol or name/i);
    fireEvent.change(searchInput, { target: { value: 'REL' } });

    await waitFor(() => {
      expect(screen.getByText('Reliance Industries Limited')).toBeInTheDocument();
    });

    const link = screen.getByText('Reliance Industries Limited').closest('a');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', `/securities/${encodeURIComponent('NSE_EQ|INE002A01018')}`);
  });

  test('shows empty state when search returns no results', async () => {
    vi.spyOn(securityApi, 'searchSecurities').mockResolvedValue({
      query: 'UNKNOWNXYZ',
      results: [],
    });

    render(
      <MemoryRouter>
        <Investments />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText(/Search by symbol or name/i);
    fireEvent.change(searchInput, { target: { value: 'UNKNOWNXYZ' } });

    await waitFor(() => {
      expect(screen.getByText(/No securities found matching/i)).toBeInTheDocument();
    });
  });

  test('does not contain any Buy, Sell, SIP, trade, or order buttons', async () => {
    render(
      <MemoryRouter>
        <Investments />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText(/Search by symbol or name/i);
    fireEvent.change(searchInput, { target: { value: 'REL' } });

    await waitFor(() => {
      expect(screen.getByText('Reliance Industries Limited')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /^buy$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sell$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sip$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^trade$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^order$/i })).not.toBeInTheDocument();
  });
});
