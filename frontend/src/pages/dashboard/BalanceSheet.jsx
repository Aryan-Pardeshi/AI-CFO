import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { FiTrendingUp, FiPlus, FiEdit2, FiMinusCircle, FiPlusCircle, FiTrash2, FiX, FiCheck } from 'react-icons/fi';

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

const ASSET_TYPES = [
  'Stock (US)',
  'Stock (India)',
  'Mutual Fund',
  'ETF',
  'Government Bond',
  'Sovereign Gold Bond',
  'Fixed Deposit',
  'Crypto',
  'Real Estate'
];

const getLineColor = (name, index) => {
  if (LINE_COLORS[name]) return LINE_COLORS[name];
  const fallbackColors = ['#059669', '#7C3AED', '#DB2777', '#EA580C', '#0284C7', '#CA8A04'];
  return fallbackColors[index % fallbackColors.length];
};

const BalanceSheet = () => {
  const { userEmail } = useAuth();
  const [portfolio, setPortfolio] = useState([]);
  const [fullFinancials, setFullFinancials] = useState({});
  const [liveData, setLiveData] = useState({});
  const [historicalData, setHistoricalData] = useState([]);
  const [timeRange, setTimeRange] = useState('1M');
  const [activeLines, setActiveLines] = useState(['Total Portfolio', 'NIFTY 50']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionItem, setActionItem] = useState(null); // item being edited/bought/sold
  const [actionType, setActionType] = useState(null); // 'BUY' | 'SELL' | 'EDIT'

  // Modal form inputs
  const [formTicker, setFormTicker] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('Stock (India)');
  const [formQty, setFormQty] = useState('');
  const [formPrice, setFormPrice] = useState('');

  const fetchBalanceSheetData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:5000/api/auth/user/${encodeURIComponent(userEmail)}`);
      let tickers = [];
      if (res.ok) {
        const json = await res.json();
        const financials = json.user?.financials || {};
        setFullFinancials(financials);

        const userPortfolio = financials.portfolio || [
          { ticker: 'AAPL', name: 'Apple Inc.', type: 'Stock (US)', quantity: 15, buyPrice: 185.50 },
          { ticker: 'RELIANCE.NS', name: 'Reliance Industries', type: 'Stock (India)', quantity: 50, buyPrice: 2850.00 }
        ];
        setPortfolio(userPortfolio);
        
        tickers = userPortfolio.map(p => p.ticker).filter(Boolean);
        if (tickers.length > 0) {
          const priceRes = await fetch(`http://localhost:5000/api/portfolio/prices?tickers=${tickers.join(',')}`);
          if (priceRes.ok) {
            const priceJson = await priceRes.json();
            setLiveData(priceJson.prices || {});
          }
        }
      }

      // Fetch normalized percentage return historical data
      const histRes = await fetch(`http://localhost:5000/api/portfolio/historical?range=${timeRange}&tickers=${tickers.join(',')}`);
      if (histRes.ok) {
        const histJson = await histRes.json();
        setHistoricalData(histJson.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch balance sheet:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userEmail) fetchBalanceSheetData();
  }, [userEmail, timeRange]);

  const savePortfolioToBackend = async (updatedPortfolio) => {
    try {
      setSaving(true);
      const updatedFinancials = {
        ...fullFinancials,
        portfolio: updatedPortfolio
      };

      const res = await fetch('http://localhost:5000/api/auth/financials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          financials: updatedFinancials
        })
      });

      if (res.ok) {
        setPortfolio(updatedPortfolio);
        setFullFinancials(updatedFinancials);
      }
    } catch (err) {
      console.error('Failed to update portfolio:', err);
    } finally {
      setSaving(false);
    }
  };

  // ADD NEW ASSET
  const handleAddAssetSubmit = (e) => {
    e.preventDefault();
    if (!formTicker || !formQty || !formPrice) return;

    const newAsset = {
      ticker: formTicker.toUpperCase().trim(),
      name: formName || formTicker.toUpperCase(),
      type: formType,
      quantity: parseFloat(formQty),
      buyPrice: parseFloat(formPrice)
    };

    const updated = [...portfolio, newAsset];
    savePortfolioToBackend(updated);

    // Reset & close
    setShowAddModal(false);
    setFormTicker('');
    setFormName('');
    setFormQty('');
    setFormPrice('');
  };

  // BUY MORE
  const handleBuyMoreSubmit = (e) => {
    e.preventDefault();
    if (!actionItem || !formQty || !formPrice) return;

    const additionalQty = parseFloat(formQty);
    const buyPrice = parseFloat(formPrice);
    const existingQty = Number(actionItem.quantity) || 0;
    const existingPrice = Number(actionItem.buyPrice) || 0;

    const totalQty = existingQty + additionalQty;
    const blendedPrice = totalQty > 0 
      ? ((existingQty * existingPrice) + (additionalQty * buyPrice)) / totalQty
      : buyPrice;

    const updated = portfolio.map(item => 
      item.ticker === actionItem.ticker 
        ? { ...item, quantity: totalQty, buyPrice: parseFloat(blendedPrice.toFixed(2)) }
        : item
    );

    savePortfolioToBackend(updated);
    setActionItem(null);
    setActionType(null);
  };

  // SELL (PARTIAL / FULL)
  const handleSellSubmit = (e) => {
    e.preventDefault();
    if (!actionItem || !formQty) return;

    const sellQty = parseFloat(formQty);
    const existingQty = Number(actionItem.quantity) || 0;

    let updated = [];
    if (sellQty >= existingQty) {
      // Remove position
      updated = portfolio.filter(item => item.ticker !== actionItem.ticker);
    } else {
      // Reduce position
      updated = portfolio.map(item =>
        item.ticker === actionItem.ticker
          ? { ...item, quantity: existingQty - sellQty }
          : item
      );
    }

    savePortfolioToBackend(updated);
    setActionItem(null);
    setActionType(null);
  };

  // EDIT INSTRUMENT
  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!actionItem) return;

    const updated = portfolio.map(item =>
      item.ticker === actionItem.ticker
        ? {
            ...item,
            ticker: formTicker.toUpperCase().trim(),
            name: formName || formTicker,
            type: formType,
            quantity: parseFloat(formQty) || item.quantity,
            buyPrice: parseFloat(formPrice) || item.buyPrice
          }
        : item
    );

    savePortfolioToBackend(updated);
    setActionItem(null);
    setActionType(null);
  };

  const handleDeleteItem = (ticker) => {
    const updated = portfolio.filter(item => item.ticker !== ticker);
    savePortfolioToBackend(updated);
  };

  if (loading && portfolio.length === 0) return <div style={{ padding: '2rem' }}>Loading real-time balance sheet and valuation charts...</div>;

  let totalInvested = 0;
  let totalCurrentValue = 0;
  let bestPerformer = { ticker: 'N/A', returnPct: -Infinity };

  portfolio.forEach(item => {
    const qty = Number(item.quantity) || 0;
    const buyPrice = Number(item.buyPrice) || 0;
    const invested = qty * buyPrice;
    totalInvested += invested;

    const livePrice = liveData[item.ticker] || buyPrice;
    const currentVal = qty * livePrice;
    totalCurrentValue += currentVal;

    const pnlPercent = invested > 0 ? ((currentVal - invested) / invested) * 100 : 0;
    if (pnlPercent > bestPerformer.returnPct) {
      bestPerformer = { ticker: item.ticker || item.name, returnPct: pnlPercent };
    }
  });

  const totalPnl = totalCurrentValue - totalInvested;
  const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const isPositive = totalPnl >= 0;

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
        ? (prev.length > 1 ? prev.filter(l => l !== lineName) : prev) 
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
            Real-time multi-asset valuation with full Buy/Sell/Edit lifecycle management.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" onClick={fetchBalanceSheetData}>
            Refresh Live Prices
          </Button>
          <Button onClick={() => {
            setFormTicker(''); setFormName(''); setFormQty(''); setFormPrice('');
            setShowAddModal(true);
          }}>
            <FiPlus size={16} style={{ marginRight: '0.4rem' }} /> Add New Asset
          </Button>
        </div>
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
          <div style={{ fontSize: '1.6rem', fontWeight: 600, marginTop: '0.25rem', fontFamily: 'var(--font-serif)', color: isPositive ? '#064E3B' : '#B91C1C' }}>
            ₹{totalCurrentValue.toLocaleString()}
          </div>
        </div>

        <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Unrealized Returns (P&L)
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 600, marginTop: '0.25rem', color: isPositive ? '#064E3B' : '#B91C1C' }}>
            {isPositive ? '+' : ''}₹{totalPnl.toLocaleString()} <span style={{ fontSize: '0.95rem' }}>({isPositive ? '+' : ''}{totalPnlPercent.toFixed(2)}%)</span>
          </div>
        </div>

        <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Top Performing Asset
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 600, marginTop: '0.4rem' }}>
            {bestPerformer.ticker !== 'N/A' ? `${bestPerformer.ticker} (+${bestPerformer.returnPct.toFixed(1)}%)` : 'None logged'}
          </div>
        </div>
      </div>

      {/* 3. Detailed Assets Table with Hover Action Controls */}
      <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Active Holdings & Instruments</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {saving ? 'Updating DynamoDB...' : `${portfolio.length} Positions`}
          </span>
        </div>

        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', background: 'var(--bg-color)' }}>
                <th style={{ padding: '1rem', fontWeight: 600 }}>Asset / Symbol</th>
                <th style={{ padding: '1rem', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Quantity</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Avg Buy Price</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Live Price</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>P&L (₹)</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Returns (%)</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>Position Actions</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map((item, idx) => {
                const qty = Number(item.quantity) || 0;
                const buyPrice = Number(item.buyPrice) || 0;
                const invested = qty * buyPrice;
                const livePrice = liveData[item.ticker] || buyPrice;
                const currentVal = qty * livePrice;
                const pnl = currentVal - invested;
                const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
                const itemPositive = pnl >= 0;

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>
                      <div>{item.ticker || item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{item.name}</div>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                      <span style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                        {item.type}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>{qty}</td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>₹{buyPrice.toLocaleString()}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600 }}>
                      ₹{livePrice.toLocaleString()}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', color: itemPositive ? '#064E3B' : '#B91C1C', fontWeight: 600 }}>
                      {itemPositive ? '+' : ''}₹{pnl.toLocaleString()}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', color: itemPositive ? '#064E3B' : '#B91C1C', fontWeight: 600 }}>
                      {itemPositive ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                        {/* BUY MORE */}
                        <button
                          onClick={() => {
                            setActionItem(item);
                            setActionType('BUY');
                            setFormQty('');
                            setFormPrice(livePrice.toString());
                          }}
                          style={{ background: 'rgba(6,78,59,0.1)', border: '1px solid #064E3B', color: '#064E3B', padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                          title="Buy More Position"
                        >
                          + Buy
                        </button>

                        {/* SELL */}
                        <button
                          onClick={() => {
                            setActionItem(item);
                            setActionType('SELL');
                            setFormQty('');
                            setFormPrice(livePrice.toString());
                          }}
                          style={{ background: 'rgba(185,28,28,0.1)', border: '1px solid #B91C1C', color: '#B91C1C', padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                          title="Sell Position"
                        >
                          - Sell
                        </button>

                        {/* EDIT */}
                        <button
                          onClick={() => {
                            setActionItem(item);
                            setActionType('EDIT');
                            setFormTicker(item.ticker);
                            setFormName(item.name || item.ticker);
                            setFormType(item.type || 'Stock (India)');
                            setFormQty(item.quantity.toString());
                            setFormPrice(item.buyPrice.toString());
                          }}
                          style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '0.25rem 0.4rem', color: 'var(--text-primary)', cursor: 'pointer' }}
                          title="Edit Instrument"
                        >
                          <FiEdit2 size={13} />
                        </button>

                        {/* DELETE */}
                        <button
                          onClick={() => handleDeleteItem(item.ticker)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                          title="Delete Holding"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              
              {portfolio.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No investment holdings found. Click 'Add New Asset' to populate your portfolio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. NORMALIZED PERCENTAGE RETURN LINEAR COMPARISON GRAPH */}
      <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
        
        {/* Top Control Bar */}
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
                  cursor: 'pointer'
                }}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* COMPARISON LINE SELECTOR */}
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
                  fontWeight: isChecked ? 600 : 400
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

        {/* Linear Chart */}
        <div style={{ height: '360px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historicalData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border-color)' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}%`} domain={['auto', 'auto']} />
              <Tooltip formatter={(value, name) => [`${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`, name]} contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', fontSize: '0.85rem' }} />
              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '0.85rem' }} />
              {activeLines.map((lineName, idx) => {
                const color = getLineColor(lineName, idx);
                const isTotalPortfolio = lineName === 'Total Portfolio';
                const isNifty = lineName === 'NIFTY 50';
                return (
                  <Line key={lineName} type="monotone" dataKey={lineName} stroke={color} strokeWidth={isTotalPortfolio ? 3 : 2} strokeDasharray={isNifty ? '4 4' : undefined} dot={isTotalPortfolio ? { r: 2, fill: color } : false} activeDot={{ r: 5 }} />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── ADD NEW ASSET MODAL ── */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '2rem', width: '100%', maxWidth: '450px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Add New Asset / Instrument</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <FiX size={20} />
              </button>
            </div>

            <form onSubmit={handleAddAssetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Ticker / Symbol</label>
                <input type="text" required placeholder="e.g. IN0020230018, RELIANCE.NS, AAPL, HDFCBANK" value={formTicker} onChange={e => setFormTicker(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Instrument Name</label>
                <input type="text" placeholder="e.g. 7.18% Govt Bond 2033" value={formName} onChange={e => setFormName(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Instrument Type</label>
                <select value={formType} onChange={e => setFormType(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}>
                  {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Quantity</label>
                  <input type="number" step="any" required placeholder="e.g. 10" value={formQty} onChange={e => setFormQty(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Buy Price (₹)</label>
                  <input type="number" step="any" required placeholder="e.g. 10000" value={formPrice} onChange={e => setFormPrice(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <Button type="submit">Add Position</Button>
                <Button variant="outline" type="button" onClick={() => setShowAddModal(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── BUY / SELL / EDIT MODAL ── */}
      {actionItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '2rem', width: '100%', maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                {actionType === 'BUY' && `Buy Additional ${actionItem.ticker}`}
                {actionType === 'SELL' && `Sell ${actionItem.ticker}`}
                {actionType === 'EDIT' && `Edit Instrument ${actionItem.ticker}`}
              </h3>
              <button onClick={() => { setActionItem(null); setActionType(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <FiX size={20} />
              </button>
            </div>

            {/* BUY MORE FORM */}
            {actionType === 'BUY' && (
              <form onSubmit={handleBuyMoreSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Current Position: <strong>{actionItem.quantity} units</strong> @ ₹{actionItem.buyPrice}
                </p>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Additional Quantity</label>
                  <input type="number" step="any" required placeholder="e.g. 5" value={formQty} onChange={e => setFormQty(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Purchase Price (₹)</label>
                  <input type="number" step="any" required value={formPrice} onChange={e => setFormPrice(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} />
                </div>
                <Button type="submit">Confirm Purchase</Button>
              </form>
            )}

            {/* SELL FORM */}
            {actionType === 'SELL' && (
              <form onSubmit={handleSellSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Current Position: <strong>{actionItem.quantity} units</strong>
                </p>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Quantity to Sell</label>
                  <input type="number" step="any" max={actionItem.quantity} required placeholder={`Max ${actionItem.quantity}`} value={formQty} onChange={e => setFormQty(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Executed Sale Price (₹)</label>
                  <input type="number" step="any" required value={formPrice} onChange={e => setFormPrice(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} />
                </div>
                <Button type="submit">Confirm Sale</Button>
              </form>
            )}

            {/* EDIT INSTRUMENT FORM */}
            {actionType === 'EDIT' && (
              <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Ticker</label>
                  <input type="text" required value={formTicker} onChange={e => setFormTicker(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Asset Name</label>
                  <input type="text" value={formName} onChange={e => setFormName(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Instrument Type</label>
                  <select value={formType} onChange={e => setFormType(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}>
                    {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <Button type="submit">Save Changes</Button>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default BalanceSheet;
