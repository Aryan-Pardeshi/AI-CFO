/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SecurityDetail from './SecurityDetail.jsx';
import * as securityApi from '../../lib/securityApi.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock Recharts ResponsiveContainer to render in jsdom
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => (
      <div data-testid="responsive-container" style={{ width: 500, height: 300 }}>
        {children}
      </div>
    ),
  };
});

// Exact contract payload returned by GET /securities/detail (securities_detail_route)
const EXACT_BACKEND_DETAIL_PAYLOAD = {
  security: {
    instrument_key: 'NSE_EQ|INE002A01018',
    symbol: 'RELIANCE',
    name: 'Reliance Industries Limited',
    asset_type: 'STOCK',
    exchange: 'NSE',
    isin: 'INE002A01018',
    sector: 'Energy',
  },
  quote: {
    last_price_paise: 295050,
    change_paise: 3550,
    change_pct: 1.22,
    day_change_paise: 3550,
    day_change_pct: 1.22,
    open_paise: 292000,
    high_paise: 296500,
    low_paise: 291500,
    prev_close_paise: 290000,
    volume: 5432100,
    as_of: '2026-09-20T10:00:00Z',
  },
  holding: {
    holding_id: 'h-rel',
    symbol: 'RELIANCE',
    quantity: 15,
    avg_buy_price_paise: 250000,
    invested_value_paise: 3750000,
    current_value_paise: 4425750,
    unrealized_pnl_paise: 675750,
    unrealized_pnl_pct: 18.02,
  },
  performance: {
    day_low_paise: 291500,
    day_high_paise: 296500,
    week_52_low_paise: null,
    week_52_high_paise: null,
    open_paise: 292000,
    prev_close_paise: 290000,
    volume: 5432100,
  },
  fundamentals: {
    pe_ratio: 28.5,
    pb_ratio: 2.3,
    dividend_yield_pct: 0.35,
    market_cap_paise: 199500000000000,
    aum_paise: null,
    expense_ratio_pct: null,
    nav_paise: null,
    tracking_error_pct: null,
  },
  insights: [
    { title: 'Day Performance', description: 'RELIANCE is up 1.22% today.' },
    { title: 'Trading Activity', description: 'Recorded trading volume of 5,432,100 shares.' },
  ],
  source: 'UPSTOX',
  as_of: '2026-09-20T10:00:00Z',
};

const MOCK_CANDLES = [
  { timestamp: '2026-01-01', open_paise: 280000, high_paise: 285000, low_paise: 279000, close_paise: 283000, volume: 1000000 },
  { timestamp: '2026-01-02', open_paise: 283000, high_paise: 290000, low_paise: 282000, close_paise: 288000, volume: 1200000 },
  { timestamp: '2026-01-03', open_paise: 288000, high_paise: 296000, low_paise: 287000, close_paise: 295050, volume: 1500000 },
];

const MOCK_FIT_RESULT = {
  assessment: 'POTENTIAL_FIT',
  summary: 'Aligns with your aggressive equity profile and investment horizon.',
  inputs: {
    add_amount_paise: 2500000,
    portfolio_value_before_paise: 100000000,
    portfolio_value_after_paise: 125000000,
  },
  allocation: {
    current_weight_bps: 450,
    projected_weight_bps: 720,
  },
  factors: [
    { key: 'risk_profile', status: 'ALIGNS', title: 'Risk Alignment', detail: 'Matches moderate/aggressive equity allocation' },
    { key: 'horizon', status: 'ALIGNS', title: 'Horizon Check', detail: 'Goal horizon of 7 years is appropriate for equity' },
    { key: 'sector', status: 'INFO', title: 'Sector Exposure', detail: 'Energy exposure reaches 12.4%' },
    { key: 'concentration', status: 'ALIGNS', title: 'Single-Stock Concentration', detail: 'Projected weight 7.2% is within 25.0% ceiling' },
  ],
};

describe('SecurityDetail page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(securityApi, 'getSecurityDetail').mockResolvedValue(EXACT_BACKEND_DETAIL_PAYLOAD);
    vi.spyOn(securityApi, 'getSecurityHistory').mockResolvedValue({
      instrument_key: 'NSE_EQ|INE002A01018',
      period: '1y',
      candles: MOCK_CANDLES,
    });
    vi.spyOn(securityApi, 'getSecurityFit').mockResolvedValue(MOCK_FIT_RESULT);
  });

  afterEach(() => {
    cleanup();
  });

  const renderComponent = (key = 'NSE_EQ%7CINE002A01018') => {
    return render(
      <MemoryRouter initialEntries={[`/securities/${key}`]}>
        <Routes>
          <Route path="/securities/:instrumentKey" element={<SecurityDetail />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  test('contract test: renders flawlessly with exact backend API response shape', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Reliance Industries Limited')).toBeInTheDocument();
    });

    // Security info
    expect(screen.getByText('RELIANCE')).toBeInTheDocument();
    expect(screen.getByText('NSE')).toBeInTheDocument();
    expect(screen.getByText('STOCK')).toBeInTheDocument();
    expect(screen.getByText('· Energy')).toBeInTheDocument();

    // Price and change
    expect(screen.getByText('₹2,950.50')).toBeInTheDocument();
    expect(screen.getByText(/\+₹35\.50 \(\+1\.22%\)/)).toBeInTheDocument();

    // Provenance
    expect(screen.getByText(/Source: UPSTOX/i)).toBeInTheDocument();
    expect(screen.getByText(/ISIN: INE002A01018/i)).toBeInTheDocument();

    // Backend insights rendered
    expect(screen.getByText('Contextual Notes & Insights')).toBeInTheDocument();
    expect(screen.getByText(/RELIANCE is up 1.22% today/i)).toBeInTheDocument();
    expect(screen.getByText(/Recorded trading volume of 5,432,100 shares/i)).toBeInTheDocument();
  });

  test('renders user holding details when held', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Your Holding')).toBeInTheDocument();
    });

    expect(screen.getByText('15')).toBeInTheDocument(); // Quantity
    expect(screen.getByText('+18.02%')).toBeInTheDocument(); // P&L pct
    expect(screen.getByText('₹2,500.00')).toBeInTheDocument(); // Avg buy
    expect(screen.getByText('₹44,257.50')).toBeInTheDocument(); // Current value
  });

  test('renders unowned state when security is not held (holding: null)', async () => {
    vi.spyOn(securityApi, 'getSecurityDetail').mockResolvedValue({
      ...EXACT_BACKEND_DETAIL_PAYLOAD,
      holding: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Portfolio Status')).toBeInTheDocument();
      expect(screen.getByText(/Not currently in your portfolio/i)).toBeInTheDocument();
    });
  });

  test('renders performance and fundamentals sections with honest missing-data labels', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Performance')).toBeInTheDocument();
      expect(screen.getByText('Fundamentals')).toBeInTheDocument();
    });

    // Real day high/low
    expect(screen.getByText('₹2,915.00')).toBeInTheDocument();
    expect(screen.getByText('₹2,965.00')).toBeInTheDocument();

    // 52-week values are null -> shows truthful label
    const unavailableLabels = screen.getAllByText('Not available from configured source');
    expect(unavailableLabels.length).toBeGreaterThanOrEqual(2);

    // Fundamentals real values
    expect(screen.getByText('28.50')).toBeInTheDocument(); // P/E
    expect(screen.getByText('2.30')).toBeInTheDocument(); // P/B
    expect(screen.getByText('0.35%')).toBeInTheDocument(); // Div yield
  });

  test('handles period selector changes and fetches history', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Reliance Industries Limited')).toBeInTheDocument();
    });

    const btn1M = screen.getByRole('button', { name: '1M' });
    expect(btn1M).toHaveAttribute('aria-pressed');
    fireEvent.click(btn1M);

    await waitFor(() => {
      expect(securityApi.getSecurityHistory).toHaveBeenCalledWith('NSE_EQ|INE002A01018', '1m');
    });
  });

  test('ARIA portfolio fit card renders assessment, factors, and navigates to Advisory with pre-filled prompt', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('ARIA Portfolio View')).toBeInTheDocument();
      expect(screen.getByText('Potential Fit')).toBeInTheDocument();
    });

    // Factor checks
    expect(screen.getByText('Risk Alignment')).toBeInTheDocument();
    expect(screen.getByText('Horizon Check')).toBeInTheDocument();
    expect(screen.getByText('Single-Stock Concentration')).toBeInTheDocument();

    // Ask ARIA button
    const askAriaBtn = screen.getByRole('button', { name: /Ask ARIA to explain/i });
    expect(askAriaBtn).toBeInTheDocument();
    fireEvent.click(askAriaBtn);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/ai-advisory',
      expect.objectContaining({
        state: expect.objectContaining({
          initialPrompt: expect.stringContaining('RELIANCE'),
        }),
      }),
    );
  });

  test('strictly contains NO Buy, Sell, SIP, trade, or order buttons', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Reliance Industries Limited')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /^buy$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sell$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sip$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^trade$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^order$/i })).not.toBeInTheDocument();
  });

  test('renders upstream unavailable state when detail fetch fails with 502', async () => {
    vi.spyOn(securityApi, 'getSecurityDetail').mockRejectedValue(
      new Error('Market data provider is currently unavailable'),
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Unable to load security')).toBeInTheDocument();
      expect(screen.getByText('Market data provider is currently unavailable')).toBeInTheDocument();
    });
  });

  test('renders non-Reliance instrument (e.g. HDFC Bank) with correct metadata, sector, and ISIN without Reliance data', async () => {
    const HDFC_DETAIL_PAYLOAD = {
      security: {
        instrument_key: 'NSE_EQ|INE040A01034',
        symbol: 'HDFCBANK',
        name: 'HDFC Bank Limited',
        asset_type: 'STOCK',
        exchange: 'NSE',
        isin: 'INE040A01034',
        sector: 'Financial Services',
      },
      quote: {
        last_price_paise: 165000,
        change_paise: -1250,
        change_pct: -0.75,
        day_change_paise: -1250,
        day_change_pct: -0.75,
        open_paise: 166250,
        high_paise: 166500,
        low_paise: 164000,
        prev_close_paise: 166250,
        volume: 8923400,
        as_of: '2026-09-20T10:00:00Z',
      },
      holding: null,
      performance: {
        day_low_paise: 164000,
        day_high_paise: 166500,
        week_52_low_paise: null,
        week_52_high_paise: null,
        open_paise: 166250,
        prev_close_paise: 166250,
        volume: 8923400,
      },
      fundamentals: {
        pe_ratio: 19.8,
        pb_ratio: 2.8,
        dividend_yield_pct: 1.18,
        market_cap_paise: 125000000000000,
        aum_paise: null,
        expense_ratio_pct: null,
        nav_paise: null,
        tracking_error_pct: null,
      },
      insights: [
        { title: 'Day Performance', description: 'HDFCBANK is trading 0.75% below yesterday’s close.' },
      ],
      source: 'LOCAL_QA',
      as_of: '2026-09-20T10:00:00Z',
    };

    vi.spyOn(securityApi, 'getSecurityDetail').mockResolvedValue(HDFC_DETAIL_PAYLOAD);

    renderComponent('NSE_EQ%7CINE040A01034');

    await waitFor(() => {
      expect(screen.getByText('HDFC Bank Limited')).toBeInTheDocument();
    });

    expect(screen.getByText('HDFCBANK')).toBeInTheDocument();
    expect(screen.getByText('· Financial Services')).toBeInTheDocument();
    expect(screen.getByText(/ISIN: INE040A01034/i)).toBeInTheDocument();
    expect(screen.getByText('₹1,650.00')).toBeInTheDocument();
    expect(screen.getByText(/-₹12\.50 \(-0\.75%\)/)).toBeInTheDocument();

    // Verify Reliance data is NOT present
    expect(screen.queryByText('Reliance Industries Limited')).not.toBeInTheDocument();
    expect(screen.queryByText('INE002A01018')).not.toBeInTheDocument();

    // Verify unowned state since user does not hold HDFC Bank
    expect(screen.getByText('Portfolio Status')).toBeInTheDocument();
    expect(screen.getByText(/Not currently in your portfolio/i)).toBeInTheDocument();
  });
});
