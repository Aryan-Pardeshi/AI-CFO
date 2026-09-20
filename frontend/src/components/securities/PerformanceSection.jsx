import React from 'react';
import { formatPaise } from '../../lib/money.js';

export default function PerformanceSection({ performance = {} }) {
  const items = [
    {
      label: 'Day Low',
      value: performance.day_low_paise ? formatPaise(performance.day_low_paise) : '—',
    },
    {
      label: 'Day High',
      value: performance.day_high_paise ? formatPaise(performance.day_high_paise) : '—',
    },
    {
      label: '52-Week Low',
      value: performance.week_52_low_paise
        ? formatPaise(performance.week_52_low_paise)
        : 'Not available from configured source',
      isUnavailable: !performance.week_52_low_paise,
    },
    {
      label: '52-Week High',
      value: performance.week_52_high_paise
        ? formatPaise(performance.week_52_high_paise)
        : 'Not available from configured source',
      isUnavailable: !performance.week_52_high_paise,
    },
    {
      label: 'Open',
      value: performance.open_paise ? formatPaise(performance.open_paise) : '—',
    },
    {
      label: 'Previous Close',
      value: performance.prev_close_paise ? formatPaise(performance.prev_close_paise) : '—',
    },
    {
      label: 'Volume',
      value: performance.volume ? performance.volume.toLocaleString('en-IN') : '—',
    },
  ];

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
        Performance
      </h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '1rem',
        }}
      >
        {items.map((item) => (
          <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #78716C)' }}>{item.label}</span>
            <span
              style={{
                fontSize: item.isUnavailable ? '0.75rem' : '0.9rem',
                fontWeight: item.isUnavailable ? 400 : 600,
                color: item.isUnavailable ? 'var(--text-muted, #78716C)' : 'var(--text-primary, #FAFAF9)',
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
