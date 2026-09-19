/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
