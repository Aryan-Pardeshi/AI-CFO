import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { searchSecurities } from '../../lib/securityApi.js';
import { formatPaise } from '../../lib/money.js';
import { FiSearch, FiX } from 'react-icons/fi';

const QUICK_SEARCH_CHIPS = ['Reliance', 'HDFC Bank', 'Nifty BeES', 'TCS', 'Gold BeES', 'Infosys'];

export default function Investments() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // ALL, STOCK, ETF
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const abortControllerRef = useRef(null);

  // Debounce input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Execute search
  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    searchSecurities(debouncedQuery, { signal: controller.signal })
      .then((data) => {
        const items = Array.isArray(data) ? data : data?.results || [];
        setResults(items);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Unable to load securities. Please check your connection.');
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [debouncedQuery]);

  const filteredResults = results.filter((item) => {
    if (filterType === 'STOCK') return item.asset_type === 'STOCK';
    if (filterType === 'ETF') return item.asset_type === 'ETF';
    return true;
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        maxWidth: '900px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Header */}
      <div>
        <h1
          style={{
            margin: '0 0 0.5rem 0',
            fontSize: '1.75rem',
            color: 'var(--text-primary, #FAFAF9)',
          }}
        >
          Investments & Securities
        </h1>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary, #A8A29E)' }}>
          Research Indian equities and ETFs with source-backed market data and ARIA portfolio intelligence.
        </p>
      </div>

      {/* Search Box */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'var(--surface-color, #1C1917)',
          border: isSearchFocused
            ? '1px solid var(--accent-color, #059669)'
            : '1px solid var(--border-color, #292524)',
          boxShadow: isSearchFocused
            ? '0 0 0 2px var(--accent-glow, rgba(5, 150, 105, 0.25))'
            : 'var(--shadow-sm)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '0.5rem 1rem',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <FiSearch
          size={18}
          style={{
            color: isSearchFocused ? 'var(--accent-color, #34D399)' : 'var(--text-muted, #78716C)',
            marginRight: '0.75rem',
            flexShrink: 0,
            transition: 'color 0.15s ease',
          }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          placeholder="Search by symbol or name (e.g. RELIANCE, NIFTYBEES, HDFC)..."
          aria-label="Search securities"
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            color: 'var(--text-primary, #FAFAF9)',
            fontSize: '1rem',
            outline: 'none',
            width: '100%',
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary, #A8A29E)',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <FiX size={16} />
          </button>
        )}
      </div>

      {/* Filters & Quick Chips */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        {/* Type Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {[
            { id: 'ALL', label: 'All' },
            { id: 'STOCK', label: 'Stocks' },
            { id: 'ETF', label: 'ETFs' },
          ].map((tab) => {
            const active = filterType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                style={{
                  background: active ? 'var(--accent-color, #064E3B)' : 'var(--surface-color, #1C1917)',
                  color: active ? '#FFFFFF' : 'var(--text-secondary, #A8A29E)',
                  border: active ? '1px solid #059669' : '1px solid var(--border-color, #292524)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Quick Suggestion Chips (when search is empty) */}
        {!query && (
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #78716C)' }}>Popular:</span>
            {QUICK_SEARCH_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setQuery(chip)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-color, #292524)',
                  borderRadius: '9999px',
                  color: 'var(--text-secondary, #A8A29E)',
                  padding: '0.2rem 0.6rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results List / Empty / Loading / Error States */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {loading && (
          <div
            style={{
              padding: '2.5rem',
              textAlign: 'center',
              color: 'var(--text-secondary, #A8A29E)',
              fontSize: '0.9rem',
              backgroundColor: 'var(--surface-color, #1C1917)',
              borderRadius: 'var(--radius-lg, 16px)',
              border: '1px solid var(--border-color, #292524)',
            }}
          >
            Searching securities…
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '1.25rem',
              textAlign: 'center',
              color: 'var(--error-color, #F87171)',
              fontSize: '0.9rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 'var(--radius-md, 12px)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && debouncedQuery && filteredResults.length === 0 && (
          <div
            style={{
              padding: '2.5rem',
              textAlign: 'center',
              color: 'var(--text-secondary, #A8A29E)',
              fontSize: '0.9rem',
              backgroundColor: 'var(--surface-color, #1C1917)',
              borderRadius: 'var(--radius-lg, 16px)',
              border: '1px solid var(--border-color, #292524)',
            }}
          >
            No securities found matching &ldquo;{debouncedQuery}&rdquo;. Try searching by ticker symbol (e.g. RELIANCE)
            or company name.
          </div>
        )}

        {!loading && !debouncedQuery && (
          <div
            style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              color: 'var(--text-secondary, #A8A29E)',
              fontSize: '0.9rem',
              backgroundColor: 'var(--surface-color, #1C1917)',
              borderRadius: 'var(--radius-lg, 16px)',
              border: '1px solid var(--border-color, #292524)',
            }}
          >
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary, #FAFAF9)', marginBottom: '0.5rem' }}>
              Explore Indian Equities & ETFs
            </div>
            <p style={{ margin: 0, maxWidth: '480px', marginInline: 'auto', lineHeight: 1.5 }}>
              Type a stock name or ticker symbol to inspect performance charts, fundamentals, and assess ARIA portfolio fit.
            </p>
          </div>
        )}

        {!loading &&
          filteredResults.map((item) => {
            const hasPrice = item.price_paise != null;
            const hasChange = item.day_change_paise != null && item.day_change_pct != null;
            const isPositive = hasChange && item.day_change_paise >= 0;

            return (
              <Link
                key={item.instrument_key}
                to={`/securities/${encodeURIComponent(item.instrument_key)}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '1rem 1.25rem',
                  backgroundColor: 'var(--surface-color, #1C1917)',
                  border: '1px solid var(--border-color, #292524)',
                  borderRadius: 'var(--radius-md, 12px)',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'all 0.15s ease',
                  minHeight: '64px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-color, #064E3B)';
                  e.currentTarget.style.backgroundColor = 'var(--surface-muted, #24201D)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color, #292524)';
                  e.currentTarget.style.backgroundColor = 'var(--surface-color, #1C1917)';
                }}
              >
                {/* Left: Security Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary, #FAFAF9)' }}>
                      {item.symbol}
                    </span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        backgroundColor:
                          item.asset_type === 'ETF' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: item.asset_type === 'ETF' ? '#60A5FA' : '#34D399',
                        flexShrink: 0,
                      }}
                    >
                      {item.asset_type === 'ETF' ? 'ETF' : 'Stock'}
                    </span>
                    {item.exchange && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          color: 'var(--text-muted, #78716C)',
                          border: '1px solid var(--border-subtle, #1F1B19)',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '4px',
                          flexShrink: 0,
                        }}
                      >
                        {item.exchange}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-secondary, #A8A29E)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minWidth: 0,
                    }}
                  >
                    {item.name}
                  </div>
                </div>

                {/* Right: Real Price & Change (only when genuine) */}
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.2rem', flexShrink: 0 }}>
                  {hasPrice ? (
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary, #FAFAF9)' }}>
                      {formatPaise(item.price_paise)}
                    </div>
                  ) : null}
                  {hasChange ? (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: isPositive ? '#34D399' : '#F87171',
                      }}
                    >
                      {isPositive ? '+' : ''}
                      {formatPaise(item.day_change_paise)} ({isPositive ? '+' : ''}
                      {item.day_change_pct.toFixed(2)}%)
                    </div>
                  ) : null}
                </div>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
