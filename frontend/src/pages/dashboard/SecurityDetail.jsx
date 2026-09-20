import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSecurityDetail, getSecurityHistory } from '../../lib/securityApi.js';
import { formatPaise } from '../../lib/money.js';
import SecurityChart from '../../components/securities/SecurityChart.jsx';
import HoldingCard from '../../components/securities/HoldingCard.jsx';
import PerformanceSection from '../../components/securities/PerformanceSection.jsx';
import FundamentalsSection from '../../components/securities/FundamentalsSection.jsx';
import AriaFitCard from '../../components/securities/AriaFitCard.jsx';

export default function SecurityDetail() {
  const { instrumentKey: rawKey } = useParams();
  const navigate = useNavigate();
  const instrumentKey = rawKey ? decodeURIComponent(rawKey) : '';

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [period, setPeriod] = useState('1Y');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  // Load detail
  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      if (!instrumentKey) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getSecurityDetail(instrumentKey);
        if (!cancelled) {
          setDetail(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load security details');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [instrumentKey]);

  // Load history when period or instrumentKey changes
  const fetchHistory = useCallback(
    async (p) => {
      if (!instrumentKey) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const data = await getSecurityHistory(instrumentKey, p.toLowerCase());
        setHistory(data?.candles || []);
      } catch (err) {
        setHistoryError(err.message || 'Failed to load price history');
      } finally {
        setHistoryLoading(false);
      }
    },
    [instrumentKey],
  );

  useEffect(() => {
    fetchHistory(period);
  }, [fetchHistory, period]);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem 1rem', maxWidth: '1200px', margin: '0 auto' }}>
        <button
          onClick={() => navigate('/investments')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary, #A8A29E)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: 0,
            marginBottom: '1.5rem',
          }}
        >
          ← Back to Investments
        </button>
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: 'var(--text-muted, #78716C)',
            backgroundColor: 'var(--surface-color, #1C1917)',
            borderRadius: '16px',
            border: '1px solid var(--border-color, #292524)',
          }}
          aria-live="polite"
        >
          Loading security details…
        </div>
      </div>
    );
  }

  if (error || !detail?.security) {
    return (
      <div style={{ padding: '2rem 1rem', maxWidth: '1200px', margin: '0 auto' }}>
        <button
          onClick={() => navigate('/investments')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary, #A8A29E)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: 0,
            marginBottom: '1.5rem',
          }}
        >
          ← Back to Investments
        </button>
        <div
          style={{
            padding: '2.5rem',
            textAlign: 'center',
            backgroundColor: 'var(--surface-color, #1C1917)',
            borderRadius: '16px',
            border: '1px solid var(--border-color, #292524)',
          }}
          role="alert"
        >
          <h3 style={{ color: '#EF4444', margin: '0 0 0.5rem 0' }}>Unable to load security</h3>
          <p style={{ color: 'var(--text-secondary, #A8A29E)', margin: '0 0 1.5rem 0', fontSize: '0.9rem' }}>
            {error || 'The requested security was not found.'}
          </p>
          <button
            onClick={() => navigate('/investments')}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              backgroundColor: 'var(--accent-color, #0D9488)',
              color: '#FAFAF9',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Return to Investments
          </button>
        </div>
      </div>
    );
  }

  const { security, quote, holding, performance, fundamentals, insights, source, as_of } = detail;
  const assetType = security?.asset_type || security?.type || 'STOCK';
  const pricePaise = quote?.last_price_paise;
  const changePaise = quote?.change_paise ?? quote?.day_change_paise ?? 0;
  const changePct = quote?.change_pct ?? quote?.day_change_pct ?? 0;
  const isPositive = changePaise >= 0;

  const formattedTime = as_of
    ? (() => {
        try {
          const d = new Date(as_of);
          return isNaN(d.getTime()) ? as_of : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
          return as_of;
        }
      })()
    : null;

  return (
    <div
      style={{
        padding: '0 0 3rem 0',
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      {/* Back button */}
      <div>
        <button
          onClick={() => navigate('/investments')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary, #A8A29E)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0',
            transition: 'color 0.15s ease',
          }}
          aria-label="Back to Investments"
        >
          ← Back to Investments
        </button>
      </div>

      {/* Header card */}
      <div
        style={{
          backgroundColor: 'var(--surface-color, #1C1917)',
          border: '1px solid var(--border-color, #292524)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary, #FAFAF9)' }}>
                {security.name}
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary, #A8A29E)',
                }}
              >
                {security.symbol}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  backgroundColor: 'var(--surface-muted, #292524)',
                  color: 'var(--text-muted, #78716C)',
                  border: '1px solid var(--border-color, #292524)',
                  fontWeight: 500,
                }}
              >
                {security.exchange || 'NSE'}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  backgroundColor:
                    assetType === 'ETF'
                      ? 'rgba(99, 102, 241, 0.15)'
                      : assetType === 'INDEX'
                      ? 'rgba(234, 179, 8, 0.15)'
                      : 'rgba(13, 148, 136, 0.15)',
                  color:
                    assetType === 'ETF'
                      ? '#818CF8'
                      : assetType === 'INDEX'
                      ? '#FBBF24'
                      : 'var(--accent-color, #0D9488)',
                  fontWeight: 600,
                }}
              >
                {assetType}
              </span>
              {security.sector && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #78716C)' }}>
                  · {security.sector}
                </span>
              )}
            </div>
          </div>

          {/* Price display */}
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: '1.8rem',
                fontWeight: 700,
                color: 'var(--text-primary, #FAFAF9)',
                lineHeight: 1.1,
              }}
            >
              {pricePaise != null ? formatPaise(pricePaise) : '—'}
            </div>
            <div
              style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                marginTop: '0.35rem',
                color: isPositive ? '#34D399' : '#F87171',
              }}
            >
              {isPositive ? '+' : ''}
              {changePaise != null ? formatPaise(changePaise) : '0.00'}{' '}
              ({isPositive ? '+' : ''}
              {changePct.toFixed(2)}%)
            </div>
          </div>
        </div>

        {/* Source and as-of attribution */}
        <div
          style={{
            borderTop: '1px solid var(--border-color, #292524)',
            paddingTop: '0.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.75rem',
            color: 'var(--text-muted, #78716C)',
          }}
        >
          <span>
            Source: {source || 'Upstox'}
            {formattedTime ? ` · As of ${formattedTime}` : ''}
          </span>
          {security.isin && <span>ISIN: {security.isin}</span>}
        </div>
      </div>

      {/* Main content grid: 2 columns on desktop, 1 on mobile */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          gap: '1.5rem',
          alignItems: 'start',
          width: '100%',
        }}
      >
        {/* Left Column: Chart, Performance, Fundamentals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0, width: '100%' }}>
          <SecurityChart
            candles={history}
            period={period}
            onPeriodChange={handlePeriodChange}
            loading={historyLoading}
            error={historyError}
          />

          <PerformanceSection performance={performance || quote || {}} />

          <FundamentalsSection fundamentals={fundamentals || {}} assetType={assetType} />
        </div>

        {/* Right Column: Holding, ARIA Fit Card, Insights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0, width: '100%' }}>
          <HoldingCard holding={holding} />

          <AriaFitCard
            instrumentKey={security.instrument_key || instrumentKey}
            symbol={security.symbol}
            name={security.name}
          />

          {/* Contextual Intelligence & Notes */}
          <div
            style={{
              backgroundColor: 'var(--surface-color, #1C1917)',
              border: '1px solid var(--border-color, #292524)',
              borderRadius: 'var(--radius-lg, 16px)',
              padding: '1.25rem',
            }}
          >
            <h4
              style={{
                margin: '0 0 0.5rem 0',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text-primary, #FAFAF9)',
              }}
            >
              Contextual Notes & Insights
            </h4>
            {insights && insights.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {insights.map((ins, idx) => (
                  <div key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #A8A29E)', lineHeight: 1.4 }}>
                    <strong style={{ color: 'var(--text-primary, #FAFAF9)' }}>{ins.title}: </strong>
                    {ins.description}
                  </div>
                ))}
              </div>
            )}
            <p
              style={{
                margin: 0,
                fontSize: '0.8rem',
                color: 'var(--text-secondary, #A8A29E)',
                lineHeight: 1.5,
              }}
            >
              {assetType === 'ETF'
                ? 'ETFs offer broad exposure across an underlying index or asset class. ARIA evaluates portfolio fit by assessing diversification rather than single-stock concentration limits.'
                : 'Individual stocks represent specific corporate equity. ARIA evaluates portfolio fit with strict limits on single-stock concentration (maximum 25% of invested net worth) and your declared investment horizon.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
