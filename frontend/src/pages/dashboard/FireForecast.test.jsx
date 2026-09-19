/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/fireApi.js', () => ({
  getFireForecast: vi.fn(),
  getFireGoalImpact: vi.fn(),
  getNetWorth: vi.fn(),
}));

vi.mock('../../lib/api.js', () => ({
  authenticatedRequest: vi.fn(),
}));

// Recharts needs layout APIs jsdom lacks; stub the container so the page's
// data wiring (not the chart library internals) is what gets asserted.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children, data }) => (
    <div data-testid="fire-chart" data-chart-data={JSON.stringify(data ?? [])}>
      {children}
    </div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ReferenceDot: () => null,
  ReferenceLine: () => null,
}));

import FireForecast from './FireForecast.jsx';
import { getFireForecast, getFireGoalImpact, getNetWorth } from '../../lib/fireApi.js';
import { authenticatedRequest } from '../../lib/api.js';

const liveForecast = {
  fire_age: 31,
  required_corpus_at_fire_paise: 567100000,
  projected_corpus_at_fire_paise: 570000000,
  implied_withdrawal_rate_pct: 4.8,
  conservative_fire_age: 35,
  progress_pct_today: 12.5,
  assumptions: {
    inflation: 0.06,
    step_up: 0.06,
    return_before_40: 0.12,
    return_40_to_60: 0.1,
    return_after_60: 0.08,
    post_fire_return: null,
    lifespan_age: 91,
  },
  required_curve: [
    { age: 30, corpus_paise: 500000000 },
    { age: 31, corpus_paise: 567100000 },
  ],
  projected_curve: [
    { age: 30, corpus_paise: 400000000 },
    { age: 31, corpus_paise: 570000000 },
  ],
  warnings: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <FireForecast />
    </MemoryRouter>,
  );
}

describe('FireForecast page (live API values only, never fabricated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getNetWorth.mockResolvedValue({ emergency_fund_coverage_months: 3 });
  });

  afterEach(() => {
    cleanup();
  });

  test('shows a loading state while fetching', () => {
    getFireForecast.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('renders the live result with “under these assumptions” and no invented numbers', async () => {
    getFireForecast.mockResolvedValue(liveForecast);
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: /fire forecast/i })).toBeInTheDocument());
    expect(screen.getAllByText(/under these assumptions/i).length).toBeGreaterThan(0);
    // Live values straight from the API fixture
    expect(screen.getByText(/age 31/i)).toBeInTheDocument();
    expect(screen.getByText(/56,71,000/)).toBeInTheDocument();
    // Assumption rates shown as percentages from decimal fractions
    expect(screen.getAllByText(/6%/).length).toBeGreaterThan(0);
    // Runway comes from /net-worth, never from the FIRE age
    expect(screen.getByTestId('runway-value')).toHaveTextContent(/3/);
    // Chart keeps both returned curves aligned by age
    const chart = screen.getByTestId('fire-chart');
    expect(JSON.parse(chart.getAttribute('data-chart-data'))).toEqual([
      { age: 30, required: 5000000, projected: 4000000 },
      { age: 31, required: 5671000, projected: 5700000 },
    ]);
  });

  test('shows an honest empty state when FIRE age is null (no fake marker)', async () => {
    getFireForecast.mockResolvedValue({ ...liveForecast, fire_age: null, required_corpus_at_fire_paise: null });
    getNetWorth.mockResolvedValue({ emergency_fund_coverage_months: null });
    renderPage();

    await waitFor(() => expect(screen.getAllByText(/not available/i).length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText(/age 31/i)).not.toBeInTheDocument();
    // Null runway is honest, never borrowed from FIRE age
    expect(screen.getByTestId('runway-value')).toHaveTextContent(/not available/i);
  });

  test('API failure shows retry without exposing internals or fake values', async () => {
    getFireForecast.mockRejectedValue(new Error('boom 500 secret-token-abc'));
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument());
    expect(screen.queryByText(/secret-token-abc/)).not.toBeInTheDocument();
    expect(screen.queryByText(/56,71,000/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('fire-chart')).not.toBeInTheDocument();

    // Retry re-fetches
    getFireForecast.mockResolvedValue(liveForecast);
    await userEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    await waitFor(() => expect(screen.getAllByText(/under these assumptions/i).length).toBeGreaterThan(0));
  });

  test('what-if life event converts whole rupees to integer paise and renders the delta', async () => {
    getFireForecast.mockResolvedValue(liveForecast);
    getFireGoalImpact.mockResolvedValue({
      baseline_fire_age: 31,
      with_goal_fire_age: 33,
      delta_years: 2,
      baseline_required_corpus_paise: 567100000,
      with_goal_required_corpus_paise: 612000000,
    });
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/under these assumptions/i).length).toBeGreaterThan(0));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/amount/i), '500000');
    await user.type(screen.getByLabelText(/target age/i), '35');
    await user.click(screen.getByRole('button', { name: /see impact|check impact|estimate/i }));

    await waitFor(() => expect(getFireGoalImpact).toHaveBeenCalledTimes(1));
    expect(getFireGoalImpact).toHaveBeenCalledWith({
      goal_type: expect.any(String),
      amount_today_paise: 50000000,
      target_age: 35,
    });
    const impact = screen.getByTestId('goal-impact-result');
    expect(within(impact).getByText(/age 33/i)).toBeInTheDocument();
    expect(within(impact).getByText(/\+2 years/)).toBeInTheDocument();
  });

  test('goal-impact validation blocks bad input without calling the API', async () => {
    getFireForecast.mockResolvedValue(liveForecast);
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/under these assumptions/i).length).toBeGreaterThan(0));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/amount/i), '0');
    await user.type(screen.getByLabelText(/target age/i), '35');
    await user.click(screen.getByRole('button', { name: /see impact|check impact|estimate/i }));

    expect(getFireGoalImpact).not.toHaveBeenCalled();
    expect(screen.getByText(/positive|greater than zero|must be/i)).toBeInTheDocument();
  });

  test('null goal-impact ages render an honest message, never POSTs /goals', async () => {
    getFireForecast.mockResolvedValue(liveForecast);
    getFireGoalImpact.mockResolvedValue({
      baseline_fire_age: null,
      with_goal_fire_age: null,
      delta_years: null,
      baseline_required_corpus_paise: null,
      with_goal_required_corpus_paise: null,
    });
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/under these assumptions/i).length).toBeGreaterThan(0));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/amount/i), '500000');
    await user.type(screen.getByLabelText(/target age/i), '35');
    await user.click(screen.getByRole('button', { name: /see impact|check impact|estimate/i }));

    await waitFor(() => expect(screen.getByTestId('goal-impact-result')).toBeInTheDocument());
    expect(screen.getByTestId('goal-impact-result')).toHaveTextContent(/not available/i);
    expect(authenticatedRequest).not.toHaveBeenCalledWith(
      '/goals',
      expect.anything(),
    );
  });
});
