/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AriaFitCard from './AriaFitCard.jsx';
import * as securityApi from '../../lib/securityApi.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const MOCK_FIT_RESULT_10K = {
  assessment: 'POTENTIAL_FIT',
  summary: 'Aligns with your aggressive equity profile and investment horizon.',
  inputs: {
    add_amount_paise: 1000000,
    portfolio_value_before_paise: 100000000,
    portfolio_value_after_paise: 101000000,
  },
  allocation: {
    current_weight_bps: 450,
    projected_weight_bps: 540,
  },
  factors: [
    { key: 'risk_profile', status: 'ALIGNS', title: 'Risk Alignment', detail: 'Matches moderate/aggressive equity allocation' },
    { key: 'horizon', status: 'ALIGNS', title: 'Horizon Check', detail: 'Goal horizon of 7 years is appropriate for equity' },
    { key: 'sector', status: 'INFO', title: 'Sector Exposure', detail: 'Energy exposure reaches 11.2%' },
    { key: 'concentration', status: 'ALIGNS', title: 'Single-Stock Concentration', detail: 'Projected weight 5.4% is within 25.0% ceiling' },
  ],
};

const MOCK_FIT_RESULT_25K = {
  assessment: 'POTENTIAL_FIT',
  summary: 'Aligns with your aggressive equity profile and investment horizon.',
  inputs: {
    add_amount_paise: 2500000,
    portfolio_value_before_paise: 100000000,
    portfolio_value_after_paise: 102500000,
  },
  allocation: {
    current_weight_bps: 450,
    projected_weight_bps: 680,
  },
  factors: [
    { key: 'risk_profile', status: 'ALIGNS', title: 'Risk Alignment', detail: 'Matches moderate/aggressive equity allocation' },
    { key: 'horizon', status: 'ALIGNS', title: 'Horizon Check', detail: 'Goal horizon of 7 years is appropriate for equity' },
    { key: 'concentration', status: 'ALIGNS', title: 'Single-Stock Concentration', detail: 'Projected weight 6.8% is within 25.0% ceiling' },
  ],
};

describe('AriaFitCard component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(securityApi, 'getSecurityFit').mockImplementation(async (key, amt) => {
      if (amt === 1000000) return MOCK_FIT_RESULT_10K;
      return MOCK_FIT_RESULT_25K;
    });
  });

  afterEach(() => {
    cleanup();
  });

  test('clicking a preset amount button (e.g. ₹10,000) renders assessment, allocation, factors, and Ask ARIA CTA', async () => {
    render(
      <AriaFitCard
        instrumentKey="NSE_EQ|INE002A01018"
        symbol="RELIANCE"
        name="Reliance Industries Limited"
      />,
    );

    // Initial default is ₹25,000
    await waitFor(() => {
      expect(screen.getByText('Potential Fit')).toBeInTheDocument();
    });

    // Click the ₹10,000 preset amount button
    const preset10kBtn = screen.getByRole('button', { name: '₹10,000' });
    expect(preset10kBtn).toBeInTheDocument();
    fireEvent.click(preset10kBtn);

    await waitFor(() => {
      expect(securityApi.getSecurityFit).toHaveBeenCalledWith('NSE_EQ|INE002A01018', 1000000);
    });

    // 1. Assessment
    expect(screen.getByText('Potential Fit')).toBeInTheDocument();

    // 2. Allocation shift
    expect(screen.getByText('Holding Allocation')).toBeInTheDocument();
    expect(screen.getByText(/4\.5% →/)).toBeInTheDocument();
    expect(screen.getAllByText(/5\.4%/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Projected Portfolio Value')).toBeInTheDocument();

    // 3. Factors
    expect(screen.getByText('Risk Alignment')).toBeInTheDocument();
    expect(screen.getByText('Horizon Check')).toBeInTheDocument();
    expect(screen.getByText('Sector Exposure')).toBeInTheDocument();
    expect(screen.getByText('Single-Stock Concentration')).toBeInTheDocument();

    // 4. "Ask ARIA" CTA
    const askAriaBtn = screen.getByRole('button', { name: 'Ask ARIA to explain this' });
    expect(askAriaBtn).toBeInTheDocument();

    // Clicking "Ask ARIA" navigates with prefilled prompt
    fireEvent.click(askAriaBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/ai-advisory', {
      state: {
        initialPrompt: expect.stringContaining('RELIANCE'),
      },
    });
  });
});
