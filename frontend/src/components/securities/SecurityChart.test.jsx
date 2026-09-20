/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SecurityChart from './SecurityChart.jsx';

// Mock ResponsiveContainer so that LineChart receives positive dimensions in jsdom
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => (
      <div data-testid="responsive-container" style={{ width: 500, height: 300 }}>
        {React.isValidElement(children)
          ? React.cloneElement(children, { width: 500, height: 300 })
          : children}
      </div>
    ),
  };
});

describe('SecurityChart component', () => {
  test('proves a Recharts line path exists with a non-empty d attribute', () => {
    const mockCandles = [
      { date: '2026-01-01', close_paise: 280000 },
      { date: '2026-01-02', close_paise: 285000 },
      { date: '2026-01-03', close_paise: 290000 },
    ];

    const { container } = render(
      <SecurityChart candles={mockCandles} period="1M" />,
    );

    const linePath = container.querySelector('path.recharts-line-curve');
    expect(linePath).toBeInTheDocument();
    expect(linePath).toHaveAttribute('d');
    const dAttr = linePath.getAttribute('d');
    expect(dAttr).toBeTruthy();
    expect(dAttr.trim().length).toBeGreaterThan(0);
    expect(dAttr).toMatch(/^M/); // Standard SVG path starts with M (moveto)
  });

  test('defensively renders with date: candle.date ?? candle.timestamp', () => {
    // Candles providing only timestamp
    const mockCandlesWithTimestamp = [
      { timestamp: '2026-01-01', close_paise: 280000 },
      { timestamp: '2026-01-02', close_paise: 285000 },
      { timestamp: '2026-01-03', close_paise: 290000 },
    ];

    const { container } = render(
      <SecurityChart candles={mockCandlesWithTimestamp} period="1M" />,
    );

    const linePath = container.querySelector('path.recharts-line-curve');
    expect(linePath).toBeInTheDocument();
    expect(linePath.getAttribute('d')).toBeTruthy();
    expect(linePath.getAttribute('d').trim().length).toBeGreaterThan(0);
  });
});
