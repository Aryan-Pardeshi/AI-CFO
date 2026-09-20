/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ userEmail: 'test@example.com' }),
}));

vi.mock('../../lib/dashboardApi.js', () => ({
  getDashboardProfile: vi.fn().mockResolvedValue({
    user: {
      financials: {
        incomes: { salary: '85000' },
        monthlyExpenses: { housing: '25000', food: '15000' },
        liabilities: { homeLoan: '20000' },
      },
    },
  }),
  getCashflowSummary: vi.fn().mockRejectedValue(new Error('unavailable')),
}));

import Overview from './Overview.jsx';

describe('Overview dashboard FIRE entry', () => {
  afterEach(() => {
    cleanup();
  });

  test('exposes a visible “View FIRE forecast” action targeting /fire', async () => {
    render(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    );

    const action = await screen.findByRole('link', { name: /view fire forecast/i });
    expect(action).toBeVisible();
    expect(action.getAttribute('href')).toBe('/fire');
  });
});

describe('Overview dashboard Category Allocation legend', () => {
  afterEach(() => {
    cleanup();
  });

  test('renders responsive legend list below the donut chart with accessible markup', async () => {
    render(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    );

    const legendList = await screen.findByRole('list', { name: /category allocation legend/i });
    expect(legendList).toBeInTheDocument();

    const listItems = within(legendList).getAllByRole('listitem');
    expect(listItems).toHaveLength(2);
  });

  test('displays category name, rupee amount, and percentage dynamically for each item', async () => {
    render(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    );

    const legendList = await screen.findByRole('list', { name: /category allocation legend/i });
    const listItems = within(legendList).getAllByRole('listitem');

    // First item: HOUSING (₹25,000, 62.5%)
    expect(within(listItems[0]).getByText('HOUSING')).toBeInTheDocument();
    expect(within(listItems[0]).getByText('₹25,000')).toBeInTheDocument();
    expect(within(listItems[0]).getByText('62.5%')).toBeInTheDocument();

    // Second item: FOOD (₹15,000, 37.5%)
    expect(within(listItems[1]).getByText('FOOD')).toBeInTheDocument();
    expect(within(listItems[1]).getByText('₹15,000')).toBeInTheDocument();
    expect(within(listItems[1]).getByText('37.5%')).toBeInTheDocument();
  });

  test('displays matching color swatches with accessible labels for screen readers', async () => {
    render(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    );

    const housingSwatch = await screen.findByLabelText(/housing color/i);
    expect(housingSwatch).toBeInTheDocument();
    expect(housingSwatch).toHaveStyle({ backgroundColor: '#059669' });

    const foodSwatch = await screen.findByLabelText(/food color/i);
    expect(foodSwatch).toBeInTheDocument();
    expect(foodSwatch).toHaveStyle({ backgroundColor: '#D97706' });
  });
});

