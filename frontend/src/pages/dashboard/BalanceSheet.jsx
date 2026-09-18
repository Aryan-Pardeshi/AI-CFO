import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { FiTrendingUp } from 'react-icons/fi';
import { getDashboardProfile, getPortfolioHistorical, getPortfolioPrices } from '../../lib/dashboardApi.js';
import { derivePortfolioValuation } from '../../lib/valuation.js';

const LINE_COLORS = {
  'Total Portfolio': '#064E3B', // Deep Forest Green
  'NIFTY 50': '#B45309',       // Warm Amber
  'S&P 500': '#3B82F6',        // Deep Blue
  'AAPL': '#6366F1',           // Indigo
  'RELIANCE.NS': '#10B981',    // Emerald
  'TCS.NS': '#EC4899',         // Pink
  'HDFCBANK.NS': '#8B5CF6',    // Purple
  'DEFAULT': '#D97706'
};

const getLineColor = (name, index) => {
  if (LINE_COLORS[name]) return LINE_COLORS[name];
  const fallbackColors = ['#059669', '#7C3AED', '#DB2777', '#EA580C', '#0284C7', '#CA8A04'];
  return fallbackColors[index % fallbackColors.length];
};

const BalanceSheet = () => {
  const { userEmail } = useAuth();
  const [portfolio, setPortfolio] = useState([]);
  const [liveData, setLiveData] = useState({});
  const [historicalData, setHistoricalData] = useState([]);
  const [timeRange, setTimeRange] = useState('1M');
  const [activeLines, setActiveLines] = useState(['Total Portfolio', 'NIFTY 50']);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const fetchBalanceSheetData = async () => {
    setLoadError('');
    setLiveData({});
    try {
      setLoading(true);
      const profile = await getDashboardProfile();
      const userPortfolio = profile?.user?.financials?.portfolio || [];
      setPortfolio(userPortfolio);

      const tickers = userPortfolio.map(p => p.ticker).filter(Boolean);
      let priceJson = null;
      if (tickers.length > 0) {
        try {
          priceJson = await getPortfolioPrices(tickers);
        } catch (err) {
          console.error('Failed to fetch live prices:', err);
          setLoadError('Live prices are unavailable right now. Valuation and P&L are not shown until a quote is available.');
        }
      }
      setLiveData(priceJson?.prices || {});

      // Fetch normalized percentage return historical data
      try {
        const histJson = await getPortfolioHistorical(timeRange, tickers);
        setHistoricalData(histJson?.data || []);
      } catch (err) {
        console.error('Failed to fetch historical portfolio data:', err);
        setHistoricalData([]);
      }
    } catch (err) {
      console.error("Failed to fetch balance sheet:", err);
      setLoadError(err?.message || 'Unable to load your balance sheet right now.');
      setPortfolio([]);
      setHistoricalData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userEmail) fetchBalanceSheetData();
  }, [userEmail, timeRange]);

  if (loading && portfolio.length === 0) return <div style={{ padding: '2rem' }}>Loading real-time balance sheet and valuation charts...</div>;
  if (loadError && portfolio.length === 0) return <div role="alert" style={{ padding: '2rem', color: '#B91C1C' }}>{loadError}</div>;

  const valuation = derivePortfolioValuation(portfolio, liveData);
  const { totalInvested, totalCurrentValue, totalPnl, totalPnlPercent, bestPerformer } = valuation;
  const isPositive = totalPnl !== null && totalPnl >= 0;

  // Available lines for comparison
  const portfolioTickers = portfolio.map(p => p.ticker).filter(Boolean);
  const availableComparisonLines = [
    'Total Portfolio',
    'NIFTY 50',
    'S&P 500',
    ...portfolioTickers
  ];

  const toggleLine = (lineName) => {
    setActiveLines(prev => 
      prev.includes(lineName) 
        ? (prev.length > 1 ? prev.filter(l => l !== lineName) : prev) // keep at least 1 line
        : [...prev, lineName]
    );
  };

  const timeRanges = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* 1. Header & Quick Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0' }}>Portfolio Balance Sheet & Asset Ledger</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Real-time multi-asset valuation powered by Yahoo Finance API.
          </p>
        </div>
        <Button variant="outline" onClick={fetchBalanceSheetData}>
          Refresh Live Prices
        </Button>
      </div>

      {/* 2. Key Performance Metrics Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Total Invested Capital
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 600, marginTop: '0.25rem', fontFamily: 'var(--font-serif)' }}>
            ₹{totalInvested.toLocaleString()}
          </div>
        </div>

        <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Current Market Value
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 600, marginTop: '0.25rem', fontFamily: 'var(--font-serif)', color: totalCurrentValue === null ? 'var(--text-primary)' : isPositive ? '#064E3B' : '#B91C1C' }}>
            {totalCurrentValue === null ? 'Unavailable' : `${valuation.quoteState === 'partial' ? 'Partial · ' : ''}₹${totalCurrentValue.toLocaleString()}`}
          </div>
        </div>

        <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Unrealized Returns (P&L)
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 600, marginTop: '0.25rem', color: totalPnl === null ? 'var(--text-primary)' : isPositive ? '#064E3B' : '#B91C1C' }}>
            {totalPnl === null ? 'Unavailable' : <>{valuation.quoteState === 'partial' ? 'Partial · ' : ''}{isPositive ? '+' : ''}₹{totalPnl.toLocaleString()} <span style={{ fontSize: '0.95rem' }}>({isPositive ? '+' : ''}{totalPnlPercent.toFixed(2)}%)</span></>}
          </div>
        </div>

        <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Top Performing Asset
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 600, marginTop: '0.4rem' }}>
            {bestPerformer ? `${valuation.quoteState === 'partial' ? 'Partial — ' : ''}${bestPerformer.ticker} (${bestPerformer.returnPct >= 0 ? '+' : ''}${bestPerformer.returnPct.toFixed(1)}%)` : 'Unavailable'}
          </div>
        </div>
      </div>

      {/* 3. Detailed Assets Table */}
      <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Active Holdings</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{portfolio.length} Total Positions</span>
        </div>

        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', background: 'var(--bg-color)' }}>
                <th style={{ padding: '1rem', fontWeight: 600 }}>Asset / Symbol</th>
                <th style={{ padding: '1rem', fontWeight: 600 }}>Instrument Type</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Quantity</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Avg Buy Price</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Live Market Price</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Position P&L (₹)</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Returns (%)</th>
              </tr>
            </thead>
            <tbody>
              {valuation.rows.map((item, idx) => {
                const { quantity: qty, buyPrice, livePrice, pnl, returnPct: pnlPercent } = item;
                const itemPositive = pnl !== null && pnl >= 0;

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>
                      {item.ticker || item.name || 'Unknown'}
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                      <span style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                        {item.type}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>{qty}</td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>₹{buyPrice.toLocaleString()}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600 }}>
                      {livePrice === null ? 'Unavailable' : `₹${livePrice.toLocaleString()}`}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', color: pnl === null ? 'var(--text-primary)' : itemPositive ? '#064E3B' : '#B91C1C', fontWeight: 600 }}>
                      {pnl === null ? 'Unavailable' : `${itemPositive ? '+' : ''}₹${pnl.toLocaleString()}`}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', color: pnlPercent === null ? 'var(--text-primary)' : itemPositive ? '#064E3B' : '#B91C1C', fontWeight: 600 }}>
                      {pnlPercent === null ? 'Unavailable' : `${itemPositive ? '+' : ''}${pnlPercent.toFixed(2)}%`}
                    </td>
                  </tr>
                );
              })}
              
              {portfolio.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No investments found in your portfolio ledger. Update your portfolio in onboarding or manual entry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. NORMALIZED PERCENTAGE RETURN LINEAR COMPARISON GRAPH */}
      <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
        
        {/* Top Control Bar: Title & Time Ranges */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FiTrendingUp color="#064E3B" size={20} />
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Relative Performance & Benchmark Growth Chart (% Return)</h3>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Normalized percentage gain/loss comparison over the selected timeframe.
            </p>
          </div>

          {/* Time Range Filter */}
          <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-color)', padding: '0.25rem', border: '1px solid var(--border-color)' }}>
            {timeRanges.map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                style={{
                  padding: '0.35rem 0.75rem',
                  border: 'none',
                  background: timeRange === range ? 'var(--accent-color)' : 'transparent',
                  color: timeRange === range ? '#FFFFFF' : 'var(--text-primary)',
                  fontWeight: timeRange === range ? 600 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  borderRadius: '0',
                  transition: 'all 0.15s ease'
                }}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* COMPARISON LINE SELECTOR (Requested Feature) */}
        <div style={{ 
          background: 'var(--bg-color)', 
          border: '1px solid var(--border-color)', 
          padding: '0.85rem 1rem', 
          marginBottom: '1.5rem',
          display: 'flex', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '0.75rem' 
        }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Overlay Lines & Assets:
          </span>
          {availableComparisonLines.map((lineName, idx) => {
            const isChecked = activeLines.includes(lineName);
            const color = getLineColor(lineName, idx);
            return (
              <button
                key={lineName}
                onClick={() => toggleLine(lineName)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.75rem',
                  background: isChecked ? 'var(--surface-color)' : 'transparent',
                  border: `1px solid ${isChecked ? color : 'var(--border-color)'}`,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: isChecked ? 600 : 400,
                  transition: 'all 0.15s ease'
                }}
              >
                <span style={{ 
                  display: 'inline-block', 
                  width: '10px', 
                  height: '10px', 
                  backgroundColor: isChecked ? color : 'transparent',
                  border: `1.5px solid ${color}` 
                }} />
                {lineName}
              </button>
            );
          })}
        </div>

        {/* The Linear Chart (Percentage Return on Y-Axis) */}
        <div style={{ height: '360px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historicalData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} 
                axisLine={{ stroke: 'var(--border-color)' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} 
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}%`}
                domain={['auto', 'auto']}
              />
              <Tooltip 
                formatter={(value, name) => [
                  `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`,
                  name
                ]}
                contentStyle={{
                  backgroundColor: 'var(--surface-color)',
                  borderColor: 'var(--border-color)',
                  borderRadius: '0',
                  boxShadow: 'none',
                  fontSize: '0.85rem'
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '0.85rem' }} />
              
              {/* Dynamically render selected lines */}
              {activeLines.map((lineName, idx) => {
                const color = getLineColor(lineName, idx);
                const isTotalPortfolio = lineName === 'Total Portfolio';
                const isNifty = lineName === 'NIFTY 50';
                
                return (
                  <Line 
                    key={lineName}
                    type="monotone" 
                    dataKey={lineName} 
                    stroke={color} 
                    strokeWidth={isTotalPortfolio ? 3 : 2} 
                    strokeDasharray={isNifty ? '4 4' : undefined}
                    dot={isTotalPortfolio ? { r: 2, fill: color } : false} 
                    activeDot={{ r: 5 }} 
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span>Normalized Performance Baseline: 0.00% at interval inception</span>
          <span>
            Active Overlay: <strong>{activeLines.join(', ')}</strong>
          </span>
        </div>
      </div>

    </div>
  );
};

export default BalanceSheet;
