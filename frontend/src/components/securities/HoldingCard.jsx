import React from 'react';
import { formatPaise } from '../../lib/money.js';

export default function HoldingCard({ holding }) {
  const isHeld = Boolean(holding && holding.quantity > 0);

  if (!isHeld) {
    return (
      <div
        style={{
          backgroundColor: 'var(--surface-color, #1C1917)',
          border: '1px solid var(--border-color, #292524)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--text-muted, #78716C)',
            }}
          />
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary, #FAFAF9)' }}>
            Portfolio Status
          </h3>
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #A8A29E)', lineHeight: 1.4 }}>
          Not currently in your portfolio. If you hold this security with a broker, you can import or record it in Onboarding or Manual Entry.
        </p>
      </div>
    );
  }

  const pnlPaise = holding.unrealized_pnl_paise || 0;
  const pnlPct = holding.unrealized_pnl_pct || 0;
  const isPositive = pnlPaise >= 0;

  return (
    <div
      style={{
        backgroundColor: 'var(--surface-color, #1C1917)',
        border: '1px solid var(--border-color, #292524)',
        borderRadius: 'var(--radius-lg, 16px)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10B981',
            }}
          />
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary, #FAFAF9)' }}>
            Your Holding
          </h3>
        </div>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
            backgroundColor: isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: isPositive ? '#34D399' : '#F87171',
          }}
        >
          {isPositive ? '+' : ''}
          {pnlPct.toFixed(2)}%
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.85rem',
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #78716C)' }}>Quantity</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #FAFAF9)' }}>
            {holding.quantity}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #78716C)' }}>Average Buy Price</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #FAFAF9)' }}>
            {formatPaise(holding.avg_buy_price_paise)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #78716C)' }}>Invested Value</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #FAFAF9)' }}>
            {formatPaise(holding.invested_value_paise)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #78716C)' }}>Current Value</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #FAFAF9)' }}>
            {formatPaise(holding.current_value_paise)}
          </div>
        </div>
      </div>

      <div
        style={{
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border-color, #292524)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #A8A29E)' }}>Unrealized P&L</span>
        <span
          style={{
            fontSize: '1.05rem',
            fontWeight: 700,
            color: isPositive ? '#10B981' : '#EF4444',
          }}
        >
          {isPositive ? '+' : ''}
          {formatPaise(pnlPaise)}
        </span>
      </div>
    </div>
  );
}
