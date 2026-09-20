import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { formatPaise } from '../../lib/money.js';

const PERIODS = ['1D', '3D', '1M', '6M', '1Y', '3Y', '5Y'];

function formatAxisDate(val, period) {
  if (!val) return '';
  if (period === '1D' || period === '3D') {
    return val.includes('T') ? val.split('T')[1].slice(0, 5) : val;
  }
  const parts = val.split('-');
  if (parts.length === 3) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[parseInt(parts[1], 10) - 1] || parts[1];
    if (period === '1M' || period === '6M') {
      return `${parts[2]} ${month}`;
    }
    return `${month} '${parts[0].slice(2)}`;
  }
  return val;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload;
    const price = data.close_paise;
    return (
      <div
        style={{
          backgroundColor: 'var(--surface-color, #1C1917)',
          border: '1px solid var(--border-color, #292524)',
          borderRadius: '8px',
          padding: '0.6rem 0.85rem',
          boxShadow: 'var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.5))',
          fontSize: '0.85rem',
          color: 'var(--text-primary, #FAFAF9)',
        }}
      >
        <div style={{ color: 'var(--text-secondary, #A8A29E)', marginBottom: '0.25rem' }}>
          {data.timestamp || data.date || label}
        </div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#10B981' }}>
          {Number.isInteger(price) ? formatPaise(price) : `₹${(price / 100).toFixed(2)}`}
        </div>
        {data.volume ? (
          <div style={{ color: 'var(--text-muted, #78716C)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
            Vol: {data.volume.toLocaleString('en-IN')}
          </div>
        ) : null}
      </div>
    );
  }
  return null;
};

export default function SecurityChart({
  candles = [],
  period = '1Y',
  onPeriodChange,
  loading = false,
  error = null,
}) {
  const chartData = (candles || []).map((c) => {
    const candleDate = c.date ?? c.timestamp ?? '';
    const closePaise = c.close_paise ?? (c.close != null ? Math.round(c.close * 100) : 0);
    return {
      ...c,
      date: candleDate,
      timestamp: c.timestamp ?? candleDate,
      close_paise: closePaise,
      close: closePaise ? closePaise / 100 : (c.close ?? 0),
    };
  });

  const minPrice = chartData.length > 0 ? Math.min(...chartData.map((d) => d.close)) : 0;
  const maxPrice = chartData.length > 0 ? Math.max(...chartData.map((d) => d.close)) : 100;
  const padding = (maxPrice - minPrice) * 0.05 || 1;

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
      {/* Period Selector Controls */}
      <div
        role="group"
        aria-label="Chart time period"
        style={{
          display: 'flex',
          gap: '0.35rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {PERIODS.map((p) => {
          const isActive = p.toUpperCase() === String(period).toUpperCase();
          return (
            <button
              key={p}
              type="button"
              aria-pressed={isActive}
              onClick={() => onPeriodChange?.(p.toLowerCase())}
              style={{
                background: isActive ? '#064E3B' : 'transparent',
                color: isActive ? '#34D399' : 'var(--text-secondary, #A8A29E)',
                border: isActive ? '1px solid #059669' : '1px solid transparent',
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* Chart Canvas Area */}
      <div style={{ height: '320px', width: '100%', position: 'relative' }}>
        {loading ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary, #A8A29E)',
              fontSize: '0.875rem',
            }}
          >
            Loading chart data…
          </div>
        ) : error ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--error-color, #F87171)',
              fontSize: '0.875rem',
              textAlign: 'center',
              padding: '1rem',
            }}
          >
            {error}
          </div>
        ) : chartData.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted, #78716C)',
              fontSize: '0.875rem',
            }}
          >
            No historical points available for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="date"
                stroke="var(--text-muted, #78716C)"
                tickLine={false}
                axisLine={{ stroke: 'var(--border-color, #292524)' }}
                tickFormatter={(val) => formatAxisDate(val, period.toUpperCase())}
                tick={{ fontSize: 11 }}
                dy={6}
              />
              <YAxis
                domain={[Math.max(0, minPrice - padding), maxPrice + padding]}
                stroke="var(--text-muted, #78716C)"
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `₹${val.toFixed(0)}`}
                tick={{ fontSize: 11 }}
                dx={-4}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="close"
                stroke="#10B981"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 5, fill: '#10B981', stroke: '#0C0A09', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
