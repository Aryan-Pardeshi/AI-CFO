import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  FiTrendingUp,
  FiExternalLink,
  FiFilter,
  FiRefreshCw,
  FiRadio,
  FiAlertTriangle,
  FiInbox,
} from 'react-icons/fi';
import { getDashboardProfile, getPortfolioNews, getPortfolioPrices, getPortfolioSuggestions } from '../../lib/dashboardApi.js';

const MARKET_SYMBOLS = [
  { name: 'NIFTY 50', ticker: '^NSEI', prefix: '' },
  { name: 'SENSEX', ticker: '^BSESN', prefix: '' },
  { name: 'S&P 500', ticker: '^GSPC', prefix: '' },
  { name: 'NASDAQ', ticker: '^IXIC', prefix: '' },
  { name: 'GOLD FUTURES', ticker: 'GC=F', prefix: '$' },
  { name: 'USD / INR', ticker: 'INR=X', prefix: '₹' },
];

function formatMarketValue(value, prefix) {
  if (!Number.isFinite(value)) return '—';
  return `${prefix}${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// `as_of` is already an ISO 8601 UTC timestamp from the backend; slicing the
// date portion avoids any timezone-conversion surprises in the UI.
function formatAsOfDate(iso) {
  if (typeof iso !== 'string') return null;
  const datePart = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}

function formatPublishedAt(iso) {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatSuggestionPrice(price) {
  return Number.isFinite(price) ? `₹${price.toLocaleString('en-IN')}` : null;
}

// Combines a response's real `source` + `as_of` into one honest label.
// Never fabricates a provider name; returns null when neither is known.
function buildProvenanceLabel(source, asOf) {
  const asOfDate = formatAsOfDate(asOf);
  if (source && asOfDate) return `${source} · as of ${asOfDate}`;
  if (source) return source;
  if (asOfDate) return `As of ${asOfDate}`;
  return null;
}

const retryButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.35rem 0.85rem',
  background: 'transparent',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 600,
};

// `busy` mirrors the header Refresh button's `disabled={refreshing}` guard. fetchAll is not
// reentrant — overlapping runs would race their setState calls and could land a stale response
// after a newer one — so every control that can trigger it must be disabled while one is in flight.
function SectionMessage({ kind, children, onRetry, busy = false }) {
  const isError = kind === 'error';
  const Icon = isError ? FiAlertTriangle : kind === 'empty' ? FiInbox : null;
  return (
    <div
      style={{
        background: 'var(--surface-color)',
        border: '1px solid var(--border-color)',
        padding: '1.75rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      {Icon && <Icon size={20} color={isError ? '#B91C1C' : 'var(--text-secondary)'} />}
      <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>{children}</p>
      {isError && onRetry && (
        <button type="button" onClick={onRetry} disabled={busy} style={{ ...retryButtonStyle, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
          <FiRefreshCw size={13} /> {busy ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}

const News = () => {
  const { userEmail } = useAuth();

  const [userPreferences, setUserPreferences] = useState({ industries: [], instruments: [] });
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const [newsStatus, setNewsStatus] = useState('loading'); // 'loading' | 'error' | 'success'
  const [news, setNews] = useState([]);
  const [newsMeta, setNewsMeta] = useState({ source: null, as_of: null });

  const [suggestionsStatus, setSuggestionsStatus] = useState('loading');
  const [suggestions, setSuggestions] = useState([]);

  const [marketStatus, setMarketStatus] = useState('loading');
  const [marketQuotes, setMarketQuotes] = useState({});
  const [marketMeta, setMarketMeta] = useState({ source: null, as_of: null });

  const fetchAll = async () => {
    setRefreshing(true);
    setNewsStatus('loading');
    setSuggestionsStatus('loading');
    setMarketStatus('loading');

    let tickers = [];
    try {
      const userJson = await getDashboardProfile();
      const portfolio = userJson?.user?.financials?.portfolio || [];
      tickers = portfolio.map((p) => p.ticker).filter(Boolean);
      const prefs = userJson?.user?.financials?.preferences || {};
      setUserPreferences({ industries: prefs.industries || [], instruments: prefs.instruments || [] });
    } catch {
      // Without a profile we don't know the user's holdings or preferences,
      // so every section below is honestly unavailable rather than guessed.
      setNewsStatus('error');
      setSuggestionsStatus('error');
      setMarketStatus('error');
      setRefreshing(false);
      return;
    }

    const [newsResult, suggestionsResult, marketResult] = await Promise.allSettled([
      getPortfolioNews(tickers),
      getPortfolioSuggestions(),
      getPortfolioPrices(MARKET_SYMBOLS.map(({ ticker }) => ticker)),
    ]);

    if (newsResult.status === 'fulfilled') {
      setNews(Array.isArray(newsResult.value?.news) ? newsResult.value.news : []);
      setNewsMeta({ source: newsResult.value?.source ?? null, as_of: newsResult.value?.as_of ?? null });
      setNewsStatus('success');
    } else {
      setNewsStatus('error');
    }

    if (suggestionsResult.status === 'fulfilled') {
      setSuggestions(Array.isArray(suggestionsResult.value?.suggestions) ? suggestionsResult.value.suggestions : []);
      setSuggestionsStatus('success');
    } else {
      setSuggestionsStatus('error');
    }

    if (marketResult.status === 'fulfilled') {
      setMarketQuotes(marketResult.value?.quotes || {});
      setMarketMeta({ source: marketResult.value?.source ?? null, as_of: marketResult.value?.as_of ?? null });
      setMarketStatus('success');
    } else {
      setMarketStatus('error');
    }

    setRefreshing(false);
  };

  useEffect(() => {
    if (userEmail) {
      fetchAll();
    }
    // fetchAll is stable for our purposes; re-running only on identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  const availableTickers = ['ALL', ...Array.from(new Set(news.map((n) => n.ticker).filter(Boolean)))];

  const filteredNews = activeFilter === 'ALL'
    ? news
    : news.filter((n) => n.ticker?.toUpperCase() === activeFilter.toUpperCase());

  const marketIndices = MARKET_SYMBOLS.map(({ name, ticker, prefix }) => {
    const quote = marketQuotes[ticker] || {};
    const change = Number.isFinite(quote.changePercent) ? quote.changePercent : null;
    return {
      name,
      value: formatMarketValue(quote.price, prefix),
      change: change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
      positive: change === null ? null : change >= 0,
    };
  });

  let flashWireHeadlines;
  if (newsStatus === 'loading') {
    flashWireHeadlines = ['Loading live headlines…'];
  } else if (newsStatus === 'error') {
    flashWireHeadlines = ['Live headlines are unavailable right now.'];
  } else {
    const headlines = news.slice(0, 7).map((item) => item.title).filter(Boolean);
    flashWireHeadlines = headlines.length > 0
      ? headlines
      : ['No live headlines are available for your portfolio and selected interests right now.'];
  }

  const provenanceParts = [];
  if (newsStatus === 'success' && newsMeta.source) {
    const label = buildProvenanceLabel(newsMeta.source, newsMeta.as_of);
    if (label) provenanceParts.push(`News: ${label}`);
  }
  if (marketStatus === 'success' && marketMeta.source) {
    const label = buildProvenanceLabel(marketMeta.source, marketMeta.as_of);
    if (label) provenanceParts.push(`Prices: ${label}`);
  }

  const newsProvenanceLabel = buildProvenanceLabel(newsMeta.source, newsMeta.as_of);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <style>{`
        .news-main-grid {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 2rem;
          align-items: start;
        }
        @media (max-width: 860px) {
          .news-main-grid {
            grid-template-columns: 1fr;
          }
        }
        .news-marquee-track {
          display: inline-block;
          animation: marquee 35s linear infinite;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-primary);
        }
        @media (prefers-reduced-motion: reduce) {
          .news-marquee-track {
            animation: none;
          }
        }
        .news-headline-title {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          word-break: break-word;
        }
        .news-suggestion-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
      `}</style>

      {/* 1. Header Banner & Market Indices Bar */}
      <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.4rem' }}>Market Intelligence & Portfolio Feeds</h2>
            {provenanceParts.length > 0 && (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {provenanceParts.join(' · ')}
              </p>
            )}
          </div>
          <button
            onClick={fetchAll}
            disabled={refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', background: 'transparent',
              border: '1px solid var(--border-color)', color: 'var(--text-primary)',
              cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500
            }}
          >
            <FiRefreshCw /> {refreshing ? 'Updating Feeds...' : 'Refresh Intel'}
          </button>
        </div>

        {/* RUNNING HEADLINE TICKER */}
        <div style={{
          background: 'var(--bg-color)',
          border: '1px solid var(--border-color)',
          padding: '0.5rem 0.75rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            background: '#B91C1C', color: '#FFFFFF', padding: '0.2rem 0.5rem',
            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px', whiteSpace: 'nowrap'
          }}>
            <FiRadio size={12} /> FLASH WIRE
          </div>
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', flex: 1, position: 'relative' }}>
            <div className="news-marquee-track">
              {flashWireHeadlines.map((h, i) => (
                <span key={i} style={{ marginRight: '2.5rem' }}>
                  <span style={{ color: 'var(--accent-color)', fontWeight: 700, marginRight: '0.5rem' }}>•</span>
                  {h}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Indices Strip */}
        {marketStatus === 'loading' && (
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Loading market indices…
          </div>
        )}
        {marketStatus === 'error' && (
          <div style={{
            borderTop: '1px solid var(--border-color)', paddingTop: '1rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem'
          }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FiAlertTriangle color="#B91C1C" size={14} /> Market indices are unavailable right now.
            </span>
            <button type="button" onClick={fetchAll} disabled={refreshing} style={{ ...retryButtonStyle, opacity: refreshing ? 0.6 : 1, cursor: refreshing ? 'default' : 'pointer' }}>
              <FiRefreshCw size={13} /> {refreshing ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
        {marketStatus === 'success' && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem'
          }}>
            {marketIndices.map((idx, i) => (
              <div key={i} style={{ background: 'var(--bg-color)', padding: '0.6rem 0.8rem', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{idx.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{idx.value}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: idx.positive === null ? 'var(--text-secondary)' : idx.positive ? '#064E3B' : '#B91C1C' }}>
                    {idx.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Main Two-Column Layout */}
      <div className="news-main-grid">

        {/* LEFT COLUMN: Holdings-Specific News Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>

          {/* Ticker Filter Tabs */}
          {newsStatus === 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <FiFilter size={14} /> Filter Holdings:
              </span>
              {availableTickers.map((ticker) => {
                const isSelected = activeFilter === ticker;
                return (
                  <button
                    key={ticker}
                    onClick={() => setActiveFilter(ticker)}
                    style={{
                      padding: '0.35rem 0.85rem',
                      background: isSelected ? 'var(--accent-color)' : 'var(--surface-color)',
                      color: isSelected ? '#FFFFFF' : 'var(--text-primary)',
                      border: `1px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`,
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: isSelected ? 600 : 500,
                      borderRadius: '0',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {ticker === 'ALL' ? 'All My Assets' : ticker}
                  </button>
                );
              })}
            </div>
          )}

          {/* News List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {newsStatus === 'loading' && (
              <SectionMessage kind="loading">Loading headlines for your holdings…</SectionMessage>
            )}

            {newsStatus === 'error' && (
              <SectionMessage kind="error" onRetry={fetchAll} busy={refreshing}>
                We couldn't load your news feed right now.
              </SectionMessage>
            )}

            {newsStatus === 'success' && news.length === 0 && (
              <SectionMessage kind="empty">No headlines matched your holdings.</SectionMessage>
            )}

            {newsStatus === 'success' && news.length > 0 && filteredNews.length === 0 && (
              <SectionMessage kind="empty">
                No specific headlines detected for {activeFilter}. Select 'All My Assets' to view global market feeds.
              </SectionMessage>
            )}

            {newsStatus === 'success' && filteredNews.map((item) => {
              const publishedLabel = formatPublishedAt(item.publishedAt);
              return (
                <article
                  key={item.id}
                  style={{
                    background: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    transition: 'border-color 0.2s ease',
                  }}
                >
                  {/* Meta header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {item.ticker && (
                        <span style={{
                          background: 'var(--bg-color)',
                          border: '1px solid var(--border-color)',
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          letterSpacing: '0.5px'
                        }}>
                          {item.ticker}
                        </span>
                      )}
                      {item.publisher && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          {item.publisher}
                        </span>
                      )}
                    </div>
                    {publishedLabel && (
                      <span data-testid={`published-at-${item.id}`} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {publishedLabel}
                      </span>
                    )}
                  </div>

                  {/* Title (+ optional thumbnail) */}
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    {item.thumbnail && (
                      <img
                        src={item.thumbnail}
                        alt=""
                        loading="lazy"
                        style={{ width: '84px', height: '84px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-color)' }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <h3 className="news-headline-title" style={{ margin: 0, fontSize: '1.15rem', lineHeight: 1.4, fontFamily: 'var(--font-serif)', flex: 1, minWidth: 0 }}>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                        onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                      >
                        {item.title}
                      </a>
                    </h3>
                  </div>

                  {/* Summary / Snippet */}
                  {item.summary && (
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {item.summary}
                    </p>
                  )}

                  {/* Actions bottom bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--accent-color)',
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      {item.publisher ? `Read on ${item.publisher}` : 'Read full article'} <FiExternalLink size={12} />
                    </a>
                    {newsProvenanceLabel && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{newsProvenanceLabel}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: Algorithmic Stock & Asset Suggestions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>

          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <FiTrendingUp color="#064E3B" size={18} />
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Suggested For You</h3>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0', lineHeight: 1.4 }}>
              Personalized based on your preferred investment sectors:
              {userPreferences.industries?.length > 0 ? (
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginTop: '0.2rem' }}>
                  {userPreferences.industries.join(', ')}
                </strong>
              ) : (
                <span style={{ display: 'block', fontStyle: 'italic', marginTop: '0.2rem' }}>
                  No saved investment preferences yet.
                </span>
              )}
              <span style={{ display: 'block', marginTop: '0.5rem' }}>Suggestions are educational, not investment advice.</span>
            </p>

            {/* Suggestions Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {suggestionsStatus === 'loading' && (
                <SectionMessage kind="loading">Loading suggestions…</SectionMessage>
              )}

              {suggestionsStatus === 'error' && (
                <SectionMessage kind="error" onRetry={fetchAll} busy={refreshing}>
                  We couldn't load suggestions right now.
                </SectionMessage>
              )}

              {suggestionsStatus === 'success' && suggestions.length === 0 && (
                <SectionMessage kind="empty">No suggestions are available right now.</SectionMessage>
              )}

              {suggestionsStatus === 'success' && suggestions.map((item, idx) => {
                const priceLabel = formatSuggestionPrice(item.price);
                return (
                  <div
                    key={item.ticker ?? idx}
                    style={{
                      background: 'var(--bg-color)',
                      border: '1px solid var(--border-color)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                  >
                    <div className="news-suggestion-head">
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{item.ticker}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.name}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div
                          data-testid={`suggestion-price-${item.ticker ?? idx}`}
                          style={{ fontWeight: 600, fontSize: '0.9rem', color: priceLabel ? 'var(--text-primary)' : 'var(--text-secondary)', fontStyle: priceLabel ? 'normal' : 'italic' }}
                        >
                          {priceLabel ?? 'Price unavailable'}
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: String(item.change ?? '').trim().startsWith('-') ? '#B91C1C' : '#064E3B' }}>
                          {item.change ?? '—'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                      {item.industry && (
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
                          {item.industry}
                        </span>
                      )}
                      {item.instrument && (
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
                          {item.instrument}
                        </span>
                      )}
                    </div>

                    {item.rationale && (
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {item.rationale}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Ideas reflect saved preferences and available market data; they are not predictions.
              </span>
            </div>
          </div>

          {/* Asset Allocation Insight Card */}
          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Portfolio Diversification Note</h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Diversification may reduce concentration risk, but it does not ensure returns or prevent losses. Review choices against your goals and risk tolerance; this is educational information, not investment advice.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
};

export default News;
