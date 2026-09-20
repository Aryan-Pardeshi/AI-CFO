/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ userEmail: 'demo@example.com' }),
}));

vi.mock('../../lib/dashboardApi.js', () => ({
  getDashboardProfile: vi.fn(),
  getPortfolioNews: vi.fn(),
  getPortfolioSuggestions: vi.fn(),
  getPortfolioPrices: vi.fn(),
}));

import News from './News.jsx';
import {
  getDashboardProfile,
  getPortfolioNews,
  getPortfolioSuggestions,
  getPortfolioPrices,
} from '../../lib/dashboardApi.js';

const profileFixture = {
  user: {
    financials: {
      portfolio: [{ ticker: 'RELIANCE' }],
      preferences: { industries: ['Technology & Software'], instruments: ['Index & Mutual Funds'] },
    },
  },
};

const newsFixture = {
  news: [
    {
      id: 'n1',
      ticker: 'RELIANCE',
      title: 'Reliance Industries posts strong Q2 results on retail growth',
      publisher: 'Moneycontrol',
      link: 'https://example.com/n1',
      publishedAt: '2026-09-18T09:31:00Z',
      summary: 'Quarterly results beat street estimates.',
    },
  ],
  source: 'Yahoo Finance, Google News',
  as_of: '2026-09-18T09:31:00Z',
};

const suggestionsFixture = {
  suggestions: [
    {
      ticker: 'NIFTYBEES.NS',
      name: 'Nifty 50 ETF',
      industry: 'Broad Market Index',
      instrument: 'Index ETF',
      price: 266.53,
      change: '+0.17%',
      rationale: 'It is on the steadier side, which might suit a moderate risk profile.',
    },
  ],
  activePreferences: { industries: ['Technology & Software'], instruments: ['Index & Mutual Funds'] },
};

const pricesFixture = {
  prices: { '^NSEI': 25388.9 },
  quotes: { '^NSEI': { price: 25388.9, changePercent: 0.42, currency: 'INR' } },
  source: 'Yahoo Finance',
  as_of: '2026-09-18T09:31:00Z',
};

function mockHappyPath(overrides = {}) {
  getDashboardProfile.mockResolvedValue(overrides.profile ?? profileFixture);
  getPortfolioNews.mockResolvedValue(overrides.news ?? newsFixture);
  getPortfolioSuggestions.mockResolvedValue(overrides.suggestions ?? suggestionsFixture);
  getPortfolioPrices.mockResolvedValue(overrides.prices ?? pricesFixture);
}

describe('News page (grounded data only, never fabricated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders real headlines from the response', async () => {
    mockHappyPath();
    render(<News />);

    // The headline legitimately appears twice: once in the flash-wire
    // marquee and once as the article's own title.
    await waitFor(() =>
      expect(
        screen.getAllByText('Reliance Industries posts strong Q2 results on retail growth').length,
      ).toBeGreaterThan(0),
    );
  });

  test('renders the real source and as_of values, never an invented provider', async () => {
    mockHappyPath();
    render(<News />);

    await waitFor(() => expect(screen.getAllByText(/Yahoo Finance, Google News/).length).toBeGreaterThan(0));
    // as_of is surfaced as its UTC date, not re-derived or fabricated
    expect(screen.getAllByText(/2026-09-18/).length).toBeGreaterThan(0);
    // Old hardcoded provider claims must be gone
    expect(screen.queryByText(/Read Analysis on Yahoo Finance/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Verified Portfolio Coverage/)).not.toBeInTheDocument();
    // Footer link uses the article's own publisher, not a fabricated brand
    expect(screen.getByText(/Read on Moneycontrol/)).toBeInTheDocument();
  });

  test('a rejected news request shows the upstream-error state, not the empty state', async () => {
    getDashboardProfile.mockResolvedValue(profileFixture);
    getPortfolioNews.mockRejectedValue(new Error('upstream boom'));
    getPortfolioSuggestions.mockResolvedValue(suggestionsFixture);
    getPortfolioPrices.mockResolvedValue(pricesFixture);

    render(<News />);

    await waitFor(() => expect(screen.getByText(/couldn't load your news feed/i)).toBeInTheDocument());
    expect(screen.queryByText(/no headlines matched your holdings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/upstream boom/i)).not.toBeInTheDocument();
  });

  test('an empty news array shows the empty state (different wording from the error)', async () => {
    mockHappyPath({ news: { news: [], source: 'Yahoo Finance', as_of: '2026-09-18T09:31:00Z' } });
    render(<News />);

    await waitFor(() => expect(screen.getByText(/no headlines matched your holdings/i)).toBeInTheDocument());
    expect(screen.queryByText(/couldn't load your news feed/i)).not.toBeInTheDocument();
  });

  test('a suggestion with no price renders an honest unavailable value instead of throwing', async () => {
    mockHappyPath({
      suggestions: {
        suggestions: [
          {
            ticker: 'NOPRICE',
            name: 'No Price Corp',
            industry: 'Tech',
            instrument: 'Stock',
            change: '+1.00%',
            rationale: 'Rationale text.',
          },
        ],
        activePreferences: { industries: [], instruments: [] },
      },
    });

    render(<News />);

    await waitFor(() => expect(screen.getByTestId('suggestion-price-NOPRICE')).toBeInTheDocument());
    expect(screen.getByTestId('suggestion-price-NOPRICE')).toHaveTextContent(/unavailable/i);
  });

  test('an article with no publishedAt omits the timestamp instead of showing "Invalid Date"', async () => {
    mockHappyPath({
      news: {
        news: [
          {
            id: 'n2',
            ticker: 'RELIANCE',
            title: 'Headline without a publish date',
            publisher: 'Some Publisher',
            link: 'https://example.com/n2',
            summary: 'Summary text.',
          },
        ],
        source: 'Yahoo Finance',
        as_of: '2026-09-18T09:31:00Z',
      },
    });

    render(<News />);

    await waitFor(() =>
      expect(screen.getAllByText('Headline without a publish date').length).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId('published-at-n2')).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument();
  });

  test('keeps the not-investment-advice language visible', async () => {
    mockHappyPath();
    render(<News />);

    await waitFor(() =>
      expect(screen.getByText('Suggestions are educational, not investment advice.')).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Diversification may reduce concentration risk, but it does not ensure returns/i),
    ).toBeInTheDocument();
  });

  test('Retry re-invokes the APIs', async () => {
    getDashboardProfile.mockResolvedValue(profileFixture);
    getPortfolioNews.mockRejectedValue(new Error('boom'));
    getPortfolioSuggestions.mockResolvedValue(suggestionsFixture);
    getPortfolioPrices.mockResolvedValue(pricesFixture);

    render(<News />);
    await waitFor(() => expect(screen.getByText(/couldn't load your news feed/i)).toBeInTheDocument());
    expect(getPortfolioNews).toHaveBeenCalledTimes(1);

    getPortfolioNews.mockResolvedValue(newsFixture);
    const user = userEvent.setup();
    const retryButtons = screen.getAllByRole('button', { name: /retry/i });
    await user.click(retryButtons[0]);

    await waitFor(() => expect(getPortfolioNews).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getAllByText('Reliance Industries posts strong Q2 results on retail growth').length,
      ).toBeGreaterThan(0),
    );
    expect(getDashboardProfile).toHaveBeenCalledTimes(2);
    expect(getPortfolioSuggestions).toHaveBeenCalledTimes(2);
    expect(getPortfolioPrices).toHaveBeenCalledTimes(2);
  });
});
