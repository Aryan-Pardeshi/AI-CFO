import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSecurityFit } from '../../lib/securityApi.js';
import { formatPaise, rupeesToPaise } from '../../lib/money.js';

const PRESET_AMOUNTS_INR = [10000, 25000, 50000];

export default function AriaFitCard({ instrumentKey, symbol, name }) {
  const navigate = useNavigate();
  const [selectedRupees, setSelectedRupees] = useState(25000);
  const [customInput, setCustomInput] = useState('25000');
  const [inputError, setInputError] = useState(null);
  const [fitData, setFitData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFit = useCallback(
    async (rupeeAmount) => {
      if (!instrumentKey) return;
      let paise;
      try {
        paise = rupeesToPaise(rupeeAmount);
      } catch (err) {
        setInputError(err.message);
        return;
      }
      if (paise <= 0) {
        setInputError('Amount must be greater than zero');
        return;
      }
      setInputError(null);
      setLoading(true);
      setError(null);
      try {
        const data = await getSecurityFit(instrumentKey, paise);
        setFitData(data);
      } catch (err) {
        setError(err.message || 'Unable to assess portfolio fit');
      } finally {
        setLoading(false);
      }
    },
    [instrumentKey],
  );

  useEffect(() => {
    fetchFit(selectedRupees);
  }, [fetchFit, selectedRupees]);

  const handlePresetClick = (amount) => {
    setSelectedRupees(amount);
    setCustomInput(String(amount));
    setInputError(null);
  };

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    const clean = customInput.trim();
    if (!clean) {
      setInputError('Enter an illustrative amount');
      return;
    }
    try {
      const paise = rupeesToPaise(clean);
      if (paise <= 0) {
        setInputError('Amount must be greater than zero');
        return;
      }
      const rupees = paise / 100;
      setSelectedRupees(rupees);
      fetchFit(rupees);
    } catch (err) {
      setInputError(err.message);
    }
  };

  const handleAskAria = () => {
    const symbolLabel = symbol || name || 'this security';
    const assessment = fitData?.assessment || 'portfolio fit';
    const projectedWeight =
      fitData?.allocation?.projected_weight_bps != null
        ? `${(fitData.allocation.projected_weight_bps / 100).toFixed(1)}%`
        : 'unknown';
    const prompt = `Can you explain the portfolio fit assessment (${assessment}) for adding ₹${selectedRupees.toLocaleString(
      'en-IN',
    )} to ${symbolLabel}? My projected allocation would be ${projectedWeight}.`;

    navigate('/ai-advisory', {
      state: { initialPrompt: prompt },
    });
  };

  const assessmentBadge = (status) => {
    switch (status) {
      case 'POTENTIAL_FIT':
        return {
          label: 'Potential Fit',
          bg: 'rgba(16, 185, 129, 0.15)',
          color: '#34D399',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        };
      case 'NEEDS_REVIEW':
        return {
          label: 'Needs Review',
          bg: 'rgba(245, 158, 11, 0.15)',
          color: '#FBBF24',
          border: '1px solid rgba(245, 158, 11, 0.3)',
        };
      case 'INSUFFICIENT_DATA':
      default:
        return {
          label: 'Insufficient Data',
          bg: 'rgba(148, 163, 184, 0.15)',
          color: '#94A3B8',
          border: '1px solid rgba(148, 163, 184, 0.3)',
        };
    }
  };

  const factorBadge = (status) => {
    switch (status) {
      case 'ALIGNS':
        return { label: 'Aligns', color: '#34D399', bg: 'rgba(16, 185, 129, 0.12)' };
      case 'CAUTION':
        return { label: 'Caution', color: '#FBBF24', bg: 'rgba(245, 158, 11, 0.12)' };
      default:
        return { label: 'Unknown', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)' };
    }
  };

  const badgeStyle = assessmentBadge(fitData?.assessment);

  return (
    <div
      style={{
        backgroundColor: 'var(--surface-color, #1C1917)',
        border: '1px solid var(--border-color, #292524)',
        borderRadius: 'var(--radius-lg, 16px)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10B981',
              }}
            />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #FAFAF9)' }}>
              ARIA Portfolio View
            </h3>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #A8A29E)' }}>
            Decision support & allocation modeling
          </span>
        </div>

        {fitData && (
          <span
            style={{
              padding: '0.25rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: badgeStyle.bg,
              color: badgeStyle.color,
              border: badgeStyle.border,
            }}
          >
            {badgeStyle.label}
          </span>
        )}
      </div>

      {/* Illustrative Amount Selector */}
      <div>
        <label
          htmlFor="fit-amount-input"
          style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted, #78716C)', marginBottom: '0.4rem' }}
        >
          Illustrative investment amount:
        </label>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          {PRESET_AMOUNTS_INR.map((amt) => {
            const isSelected = selectedRupees === amt;
            return (
              <button
                key={amt}
                type="button"
                onClick={() => handlePresetClick(amt)}
                style={{
                  background: isSelected ? 'var(--accent-color, #064E3B)' : 'transparent',
                  color: isSelected ? '#FFFFFF' : 'var(--text-secondary, #A8A29E)',
                  border: isSelected ? '1px solid #059669' : '1px solid var(--border-color, #292524)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                ₹{amt.toLocaleString('en-IN')}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleCustomSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span
              style={{
                position: 'absolute',
                left: '0.65rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted, #78716C)',
                fontSize: '0.85rem',
              }}
            >
              ₹
            </span>
            <input
              id="fit-amount-input"
              name="illustrative_amount"
              type="text"
              inputMode="decimal"
              aria-invalid={Boolean(inputError)}
              aria-describedby={inputError ? 'fit-amount-error' : undefined}
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                setInputError(null);
              }}
              placeholder="Custom amount"
              style={{
                width: '100%',
                padding: '0.4rem 0.5rem 0.4rem 1.6rem',
                backgroundColor: 'var(--bg-color, #0C0A09)',
                border: inputError ? '1px solid var(--error-color, #F87171)' : '1px solid var(--border-color, #292524)',
                borderRadius: '6px',
                color: 'var(--text-primary, #FAFAF9)',
                fontSize: '0.85rem',
              }}
            />
          </div>
          <button
            type="submit"
            className="btn"
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.8rem',
            }}
          >
            Update
          </button>
        </form>
        {inputError && (
          <div
            id="fit-amount-error"
            role="alert"
            aria-live="polite"
            style={{ display: 'block', fontSize: '0.75rem', color: 'var(--error-color, #F87171)', marginTop: '0.3rem' }}
          >
            {inputError}
          </div>
        )}
      </div>

      {/* Loading / Error / Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary, #A8A29E)', fontSize: '0.85rem' }}>
          Assessing portfolio impact…
        </div>
      ) : error ? (
        <div
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--error-color, #F87171)',
            fontSize: '0.8rem',
          }}
        >
          {error}
        </div>
      ) : fitData ? (
        <>
          {/* Allocation Shift Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.75rem',
              padding: '0.85rem',
              borderRadius: '8px',
              backgroundColor: 'var(--surface-muted, #24201D)',
              border: '1px solid var(--border-subtle, #1F1B19)',
            }}
          >
            <div>
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted, #78716C)' }}>
                Holding Allocation
              </span>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary, #FAFAF9)' }}>
                {(fitData.allocation?.current_weight_bps / 100).toFixed(1)}% →{' '}
                <span style={{ color: '#10B981' }}>
                  {(fitData.allocation?.projected_weight_bps / 100).toFixed(1)}%
                </span>
              </span>
            </div>

            <div>
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted, #78716C)' }}>
                Projected Portfolio Value
              </span>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary, #FAFAF9)' }}>
                {formatPaise(fitData.inputs?.portfolio_value_after_paise || 0)}
              </span>
            </div>
          </div>

          {/* Factors List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {(Array.isArray(fitData.factors)
              ? fitData.factors
              : Object.entries(fitData.factors || {}).map(([key, val]) => ({ key, ...val }))
            ).map((f) => {
              const fb = factorBadge(f.status);
              return (
                <div
                  key={f.key}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--surface-muted, #24201D)',
                    border: '1px solid var(--border-subtle, #1F1B19)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary, #FAFAF9)' }}>
                      {f.title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        backgroundColor: fb.bg,
                        color: fb.color,
                      }}
                    >
                      {fb.label}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #A8A29E)', lineHeight: 1.4 }}>
                    {f.detail}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Warnings if any */}
          {fitData.warnings && fitData.warnings.length > 0 && (
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted, #78716C)',
                padding: '0.5rem',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                borderRadius: '6px',
              }}
            >
              {fitData.warnings.map((w, idx) => (
                <div key={idx}>• {w}</div>
              ))}
            </div>
          )}

          {/* Ask ARIA CTA */}
          <button
            type="button"
            className="btn"
            onClick={handleAskAria}
            style={{
              width: '100%',
              padding: '0.65rem',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Ask ARIA to explain this
          </button>
        </>
      ) : null}

      {/* Educational Disclaimer */}
      <div
        style={{
          fontSize: '0.7rem',
          color: 'var(--text-muted, #78716C)',
          textAlign: 'center',
          lineHeight: 1.3,
          paddingTop: '0.4rem',
          borderTop: '1px solid var(--border-color, #292524)',
        }}
      >
        For research and planning, not investment advice.
      </div>
    </div>
  );
}
