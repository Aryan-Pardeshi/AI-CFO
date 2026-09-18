import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { FiTrendingUp, FiExternalLink, FiFilter, FiRefreshCw, FiRadio } from 'react-icons/fi';
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

const News = () => {
  const { userEmail } = useAuth();
  const [news, setNews] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [marketQuotes, setMarketQuotes] = useState({});
  const [userPreferences, setUserPreferences] = useState({ industries: [], instruments: [] });
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNewsAndSuggestions = async () => {
    try {
      setRefreshing(true);
      const userJson = await getDashboardProfile();
      let tickers = [];
      const portfolio = userJson?.user?.financials?.portfolio || [];

      const extractedTickers = portfolio.map(p => p.ticker).filter(Boolean);
      if (extractedTickers.length > 0) {
        tickers = extractedTickers;
      }

      const prefs = userJson?.user?.financials?.preferences || {};
      setUserPreferences(prefs);

      const [newsResult, suggestionsResult, marketResult] = await Promise.allSettled([
        getPortfolioNews(tickers),
        getPortfolioSuggestions(),
        getPortfolioPrices(MARKET_SYMBOLS.map(({ ticker }) => ticker)),
      ]);

      if (newsResult.status === 'fulfilled') setNews(newsResult.value?.news || []);
      else console.error('Failed to load personalized news:', newsResult.reason);

      if (suggestionsResult.status === 'fulfilled') setSuggestions(suggestionsResult.value?.suggestions || []);
      else console.error('Failed to load personalized suggestions:', suggestionsResult.reason);

      if (marketResult.status === 'fulfilled') setMarketQuotes(marketResult.value?.quotes || {});
      else console.error('Failed to load market pulse:', marketResult.reason);
    } catch (err) {
      console.error('Failed to load news and suggestions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (userEmail) {
      fetchNewsAndSuggestions();
    }
  }, [userEmail]);

  const availableTickers = ['ALL', ...Array.from(new Set(news.map(n => n.ticker).filter(Boolean)))];

  const filteredNews = activeFilter === 'ALL' 
    ? news 
    : news.filter(n => n.ticker?.toUpperCase() === activeFilter.toUpperCase());

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

  const breakingHeadlines = news.slice(0, 7).map((item) => item.title).filter(Boolean);
  const flashWireHeadlines = breakingHeadlines.length > 0
    ? breakingHeadlines
    : ['No live headlines are available for your portfolio and selected interests right now.'];

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p>Aggregating market intelligence and asset-specific news...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* 1. Header Banner & Market Indices Bar */}
      <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.4rem' }}>Market Intelligence & Portfolio Feeds</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Curated financial news on your active holdings with algorithmic asset suggestions.
            </p>
          </div>
          <button 
            onClick={fetchNewsAndSuggestions}
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

        {/* RUNNING HEADLINE TICKER (Requested Feature) */}
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
            <div style={{
              display: 'inline-block',
              animation: 'marquee 35s linear infinite',
              fontSize: '0.85rem',
              fontWeight: 500,
              color: 'var(--text-primary)'
            }}>
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
        <div style={{ 
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', 
          gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' 
        }}>
          {marketIndices.map((idx, i) => (
            <div key={i} style={{ background: 'var(--bg-color)', padding: '0.6rem 0.8rem', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{idx.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{idx.value}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: idx.positive === null ? 'var(--text-secondary)' : idx.positive ? '#064E3B' : '#B91C1C' }}>
                  {idx.change}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Main Two-Column Layout (Yahoo Finance Style) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2rem', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Holdings-Specific News Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Ticker Filter Tabs */}
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

          {/* News List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {filteredNews.map((item) => (
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {item.publisher}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Title */}
                <h3 style={{ margin: 0, fontSize: '1.15rem', lineHeight: 1.4, fontFamily: 'var(--font-serif)' }}>
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

                {/* Summary / Snippet */}
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {item.summary}
                </p>

                {/* Actions bottom bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
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
                    Read Analysis on Yahoo Finance <FiExternalLink size={12} />
                  </a>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Verified Portfolio Coverage</span>
                </div>
              </article>
            ))}

            {filteredNews.length === 0 && (
              <div style={{ background: 'var(--surface-color)', padding: '3rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                  No specific headlines detected for {activeFilter}. Select 'All My Assets' to view global market feeds.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Algorithmic Stock & Asset Suggestions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
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
              {suggestions.map((item, idx) => (
                <div 
                  key={idx}
                  style={{
                    background: 'var(--bg-color)',
                    border: '1px solid var(--border-color)',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{item.ticker}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>₹{item.price.toLocaleString()}</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: String(item.change).trim().startsWith('-') ? '#B91C1C' : '#064E3B' }}>{item.change}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
                      {item.industry}
                    </span>
                    <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
                      {item.instrument}
                    </span>
                  </div>

                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {item.rationale}
                  </p>
                </div>
              ))}
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
