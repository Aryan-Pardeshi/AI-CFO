import React from 'react';
import { formatPaise } from '../../lib/money.js';

export default function FundamentalsSection({ fundamentals = {}, assetType = 'STOCK' }) {
  const isEtf = assetType === 'ETF';

  const stockFields = [
    { label: 'P/E Ratio', value: fundamentals.pe_ratio != null ? fundamentals.pe_ratio.toFixed(2) : null },
    { label: 'P/B Ratio', value: fundamentals.pb_ratio != null ? fundamentals.pb_ratio.toFixed(2) : null },
    {
      label: 'Dividend Yield',
      value: fundamentals.dividend_yield_pct != null ? `${fundamentals.dividend_yield_pct.toFixed(2)}%` : null,
    },
    {
      label: 'Market Cap',
      value: fundamentals.market_cap_paise != null ? formatPaise(fundamentals.market_cap_paise) : null,
    },
  ];

  const etfFields = [
    { label: 'AUM', value: fundamentals.aum_paise != null ? formatPaise(fundamentals.aum_paise) : null },
    {
      label: 'Expense Ratio',
      value: fundamentals.expense_ratio_pct != null ? `${fundamentals.expense_ratio_pct.toFixed(2)}%` : null,
    },
    { label: 'NAV', value: fundamentals.nav_paise != null ? formatPaise(fundamentals.nav_paise) : null },
    {
      label: 'Tracking Error',
      value: fundamentals.tracking_error_pct != null ? `${fundamentals.tracking_error_pct.toFixed(2)}%` : null,
    },
  ];

  const fields = isEtf ? etfFields : stockFields;

  return (
    <div
      style={{
        backgroundColor: 'var(--surface-color, #1C1917)',
        border: '1px solid var(--border-color, #292524)',
        borderRadius: 'var(--radius-lg, 16px)',
        padding: '1.25rem',
      }}
    >
      <h3
        style={{
          margin: '0 0 1rem 0',
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--text-primary, #FAFAF9)',
        }}
      >
        Fundamentals
      </h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '1rem',
        }}
      >
        {fields.map((f) => (
          <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #78716C)' }}>{f.label}</span>
            <span
              style={{
                fontSize: f.value != null ? '0.9rem' : '0.75rem',
                fontWeight: f.value != null ? 600 : 400,
                color: f.value != null ? 'var(--text-primary, #FAFAF9)' : 'var(--text-muted, #78716C)',
              }}
            >
              {f.value != null ? f.value : 'Not available from configured source'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
