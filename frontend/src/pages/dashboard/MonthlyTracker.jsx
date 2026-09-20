import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { FiPlus, FiTrash2, FiCheckCircle, FiClock, FiFilter, FiRefreshCw, FiArchive, FiTrendingUp, FiList, FiBarChart2 } from 'react-icons/fi';

const BILL_CATEGORIES = ['Housing/Rent', 'Utilities', 'Subscriptions', 'Insurance', 'Credit Card/EMI', 'Healthcare', 'Others'];

const CATEGORY_COLORS = {
  'Total Outflow': '#064E3B', // Deep Forest Green
  'Housing/Rent': '#B45309',   // Warm Amber
  'Utilities': '#3B82F6',      // Deep Blue
  'Subscriptions': '#6366F1',  // Indigo
  'Insurance': '#10B981',      // Emerald
  'Credit Card/EMI': '#EC4899',// Pink
  'Healthcare': '#8B5CF6',     // Purple
  'Others': '#D97706'
};

const getCategoryColor = (name) => CATEGORY_COLORS[name] || '#CA8A04';

const MonthlyTracker = () => {
  const { userEmail } = useAuth();
  const [activeTab, setActiveTab] = useState('CURRENT'); // 'CURRENT' | 'HISTORY'
  const [bills, setBills] = useState([]);
  const [historyArchives, setHistoryArchives] = useState([]);
  const [fullFinancials, setFullFinancials] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Chart state
  const [activeChartCategories, setActiveChartCategories] = useState(['Total Outflow', 'Housing/Rent', 'Utilities', 'Subscriptions']);
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState('');

  // Form state for adding new bill
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Housing/Rent');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('PAID');

  const fetchUserData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:5000/api/auth/user/${encodeURIComponent(userEmail)}`);
      if (res.ok) {
        const json = await res.json();
        const financials = json.user?.financials || {};
        setFullFinancials(financials);

        // Populate active bills
        const existingBills = financials.monthlyBills || [
          { id: '1', name: 'House Rent & Maintenance', amount: 28000, category: 'Housing/Rent', dueDate: '2026-09-01', status: 'PAID' },
          { id: '2', name: 'Electricity & Water Utilities', amount: 3450, category: 'Utilities', dueDate: '2026-09-10', status: 'PAID' },
          { id: '3', name: 'AWS & Cloud Hosting', amount: 4800, category: 'Subscriptions', dueDate: '2026-09-15', status: 'PAID' },
          { id: '4', name: 'Health & Term Insurance Premium', amount: 6200, category: 'Insurance', dueDate: '2026-09-20', status: 'PAID' },
          { id: '5', name: 'Car Loan EMI', amount: 14500, category: 'Credit Card/EMI', dueDate: '2026-09-25', status: 'DUE' }
        ];
        setBills(existingBills);

        // Populate historical monthly archives
        const existingHistory = financials.monthlyHistory || [
          {
            month: 'Aug 2026',
            totalPaid: 52400,
            bills: [
              { name: 'House Rent & Maintenance', amount: 28000, category: 'Housing/Rent', status: 'PAID' },
              { name: 'Electricity & Water', amount: 3800, category: 'Utilities', status: 'PAID' },
              { name: 'AWS Subscriptions', amount: 4500, category: 'Subscriptions', status: 'PAID' },
              { name: 'Car Loan EMI', amount: 14500, category: 'Credit Card/EMI', status: 'PAID' }
            ]
          },
          {
            month: 'Jul 2026',
            totalPaid: 49800,
            bills: [
              { name: 'House Rent & Maintenance', amount: 28000, category: 'Housing/Rent', status: 'PAID' },
              { name: 'Electricity & Water', amount: 3100, category: 'Utilities', status: 'PAID' },
              { name: 'AWS Subscriptions', amount: 4200, category: 'Subscriptions', status: 'PAID' },
              { name: 'Car Loan EMI', amount: 14500, category: 'Credit Card/EMI', status: 'PAID' }
            ]
          },
          {
            month: 'Jun 2026',
            totalPaid: 47900,
            bills: [
              { name: 'House Rent & Maintenance', amount: 27500, category: 'Housing/Rent', status: 'PAID' },
              { name: 'Electricity & Water', amount: 2900, category: 'Utilities', status: 'PAID' },
              { name: 'AWS Subscriptions', amount: 3000, category: 'Subscriptions', status: 'PAID' },
              { name: 'Car Loan EMI', amount: 14500, category: 'Credit Card/EMI', status: 'PAID' }
            ]
          }
        ];
        setHistoryArchives(existingHistory);
        if (existingHistory.length > 0) {
          setSelectedHistoryMonth(existingHistory[0].month);
        }
      }
    } catch (err) {
      console.error('Failed to load monthly tracker data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userEmail) fetchUserData();
  }, [userEmail]);

  const saveDataToDynamoDB = async (updatedBills, updatedHistory) => {
    try {
      setSaving(true);
      const updatedFinancials = {
        ...fullFinancials,
        monthlyBills: updatedBills,
        monthlyHistory: updatedHistory
      };

      const response = await fetch('http://localhost:5000/api/auth/financials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          financials: updatedFinancials
        })
      });

      if (response.ok) {
        setFullFinancials(updatedFinancials);
      }
    } catch (err) {
      console.error('Error saving monthly tracker data:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBill = (e) => {
    e.preventDefault();
    if (!name || !amount) return;

    const newBill = {
      id: Date.now().toString(),
      name,
      amount: parseFloat(amount),
      category,
      dueDate: dueDate || new Date().toISOString().split('T')[0],
      status
    };

    const updated = [newBill, ...bills];
    setBills(updated);
    saveDataToDynamoDB(updated, historyArchives);

    setName('');
    setAmount('');
    setDueDate('');
  };

  const toggleStatus = (id) => {
    const updated = bills.map((b) => 
      b.id === id ? { ...b, status: b.status === 'PAID' ? 'DUE' : 'PAID' } : b
    );
    setBills(updated);
    saveDataToDynamoDB(updated, historyArchives);
  };

  const handleDeleteBill = (id) => {
    const updated = bills.filter((b) => b.id !== id);
    setBills(updated);
    saveDataToDynamoDB(updated, historyArchives);
  };

  // MONTH-END CYCLE RESET & ARCHIVING
  const handleArchiveAndResetCycle = () => {
    const paidBills = bills.filter(b => b.status === 'PAID');
    const totalPaidVal = paidBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);

    const monthLabel = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    // Create archived record
    const archiveRecord = {
      month: monthLabel,
      totalPaid: totalPaidVal,
      bills: JSON.parse(JSON.stringify(bills))
    };

    // Reset active bills to DUE status (0 paid) for the new recurring month
    const resetBills = bills.map(b => ({ ...b, status: 'DUE' }));

    const updatedHistory = [archiveRecord, ...historyArchives];

    setBills(resetBills);
    setHistoryArchives(updatedHistory);
    setSelectedHistoryMonth(monthLabel);
    saveDataToDynamoDB(resetBills, updatedHistory);
  };

  const toggleChartCategory = (catName) => {
    setActiveChartCategories(prev =>
      prev.includes(catName)
        ? (prev.length > 1 ? prev.filter(c => c !== catName) : prev)
        : [...prev, catName]
    );
  };

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading monthly payment ledger & historical archives...</div>;
  }

  // Active Month Calculations
  const filteredBills = categoryFilter === 'ALL' 
    ? bills 
    : bills.filter((b) => b.category === categoryFilter);

  const totalBills = bills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
  const paidTotal = bills.filter(b => b.status === 'PAID').reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
  const dueTotal = bills.filter(b => b.status === 'DUE').reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
  const paidCount = bills.filter(b => b.status === 'PAID').length;

  // Prepare chart time-series data from historical archives
  const chartData = [...historyArchives].reverse().map(archive => {
    const point = {
      month: archive.month,
      'Total Outflow': archive.totalPaid || 0,
      'Housing/Rent': 0,
      'Utilities': 0,
      'Subscriptions': 0,
      'Insurance': 0,
      'Credit Card/EMI': 0,
      'Healthcare': 0,
      'Others': 0
    };

    if (archive.bills && Array.isArray(archive.bills)) {
      archive.bills.forEach(b => {
        if (b.status === 'PAID' && point[b.category] !== undefined) {
          point[b.category] += Number(b.amount || 0);
        }
      });
    }

    return point;
  });

  const availableChartLines = ['Total Outflow', ...BILL_CATEGORIES];

  const currentArchivedDetail = historyArchives.find(a => a.month === selectedHistoryMonth) || historyArchives[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* 1. Header Banner & Tab Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.4rem' }}>Monthly Bill & Expense Tracker</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Track active commitments, archive monthly cycles, and compare historical expense trends.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--surface-color)', padding: '0.25rem', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('CURRENT')}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              background: activeTab === 'CURRENT' ? 'var(--accent-color)' : 'transparent',
              color: activeTab === 'CURRENT' ? '#FFFFFF' : 'var(--text-primary)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <FiList size={14} /> Active Cycle
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              background: activeTab === 'HISTORY' ? 'var(--accent-color)' : 'transparent',
              color: activeTab === 'HISTORY' ? '#FFFFFF' : 'var(--text-primary)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <FiBarChart2 size={14} /> History & Trends
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Total Monthly Commitment
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 600, marginTop: '0.25rem', fontFamily: 'var(--font-serif)' }}>
            ₹{totalBills.toLocaleString()}
          </div>
        </div>

        <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Settled & Paid (Current Cycle)
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 600, marginTop: '0.25rem', color: '#064E3B', fontFamily: 'var(--font-serif)' }}>
            ₹{paidTotal.toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>({paidCount}/{bills.length} Paid)</span>
          </div>
        </div>

        <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Pending Due Payments
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 600, marginTop: '0.25rem', color: dueTotal > 0 ? '#B91C1C' : '#064E3B', fontFamily: 'var(--font-serif)' }}>
            ₹{dueTotal.toLocaleString()}
          </div>
        </div>

        <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Monthly Archival Action
          </div>
          <button
            onClick={handleArchiveAndResetCycle}
            style={{
              marginTop: '0.5rem',
              padding: '0.4rem 0.8rem',
              background: '#064E3B',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <FiArchive size={14} /> Reset & Archive Cycle
          </button>
        </div>
      </div>

      {/* ── TAB 1: ACTIVE BILLING CYCLE ── */}
      {activeTab === 'CURRENT' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem', alignItems: 'start' }}>
          
          {/* ADD BILL FORM */}
          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FiPlus /> Add Monthly Bill
            </h3>

            <form onSubmit={handleAddBill} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Bill Description</label>
                <input 
                  type="text" 
                  required 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rent, Electricity, Gym"
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Amount (₹)</label>
                <input 
                  type="number" 
                  required 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Category</label>
                <select 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}
                >
                  {BILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Due Date</label>
                <input 
                  type="date" 
                  value={dueDate} 
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Payment Status</label>
                <select 
                  value={status} 
                  onChange={(e) => setStatus(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}
                >
                  <option value="PAID">PAID (Settled)</option>
                  <option value="DUE">DUE (Pending)</option>
                </select>
              </div>

              <Button type="submit">
                Log Monthly Entry
              </Button>
            </form>
          </div>

          {/* BILLS TABLE & CATEGORY FILTER */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Category Filter Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <FiFilter size={14} /> Category Filter:
              </span>
              {['ALL', ...BILL_CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  style={{
                    padding: '0.3rem 0.75rem',
                    background: categoryFilter === cat ? 'var(--accent-color)' : 'var(--surface-color)',
                    color: categoryFilter === cat ? '#FFFFFF' : 'var(--text-primary)',
                    border: `1px solid ${categoryFilter === cat ? 'var(--accent-color)' : 'var(--border-color)'}`,
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Table */}
            <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', background: 'var(--bg-color)' }}>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Expense Item</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Category</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Amount (₹)</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'center' }}>Due Date</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBills.map((b) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{b.name}</td>
                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>
                          <span style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}>
                            {b.category}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                          ₹{Number(b.amount).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {b.dueDate}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <button
                            onClick={() => toggleStatus(b.id)}
                            style={{
                              padding: '0.2rem 0.6rem',
                              background: b.status === 'PAID' ? 'rgba(6,78,59,0.1)' : 'rgba(185,28,28,0.1)',
                              border: `1px solid ${b.status === 'PAID' ? '#064E3B' : '#B91C1C'}`,
                              color: b.status === 'PAID' ? '#064E3B' : '#B91C1C',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            {b.status === 'PAID' ? <FiCheckCircle size={12} /> : <FiClock size={12} />}
                            {b.status}
                          </button>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteBill(b.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                            title="Delete Bill"
                          >
                            <FiTrash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {filteredBills.length === 0 && (
                      <tr>
                        <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No monthly bills registered under category '{categoryFilter}'.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ── TAB 2: HISTORY & MONTHLY TRENDS COMPARISON GRAPH ── */}
      {activeTab === 'HISTORY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* COMPARISON LINE CHART */}
          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FiTrendingUp color="#064E3B" size={20} />
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Monthly Outflow & Category Trend Comparison</h3>
                </div>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Compare historical monthly spending across categories over time.
                </p>
              </div>
            </div>

            {/* Category Line Selector Buttons */}
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
                Overlay Categories:
              </span>
              {availableChartLines.map((catName) => {
                const isChecked = activeChartCategories.includes(catName);
                const color = getCategoryColor(catName);
                return (
                  <button
                    key={catName}
                    onClick={() => toggleChartCategory(catName)}
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
                    {catName}
                  </button>
                );
              })}
            </div>

            {/* Chart */}
            <div style={{ height: '360px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border-color)' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val.toLocaleString()}`} domain={['auto', 'auto']} />
                  <Tooltip formatter={(value, name) => [`₹${Number(value).toLocaleString()}`, name]} contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', fontSize: '0.85rem' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '0.85rem' }} />
                  {activeChartCategories.map((catName) => {
                    const color = getCategoryColor(catName);
                    const isTotal = catName === 'Total Outflow';
                    return (
                      <Line 
                        key={catName} 
                        type="monotone" 
                        dataKey={catName} 
                        stroke={color} 
                        strokeWidth={isTotal ? 3 : 2} 
                        dot={isTotal ? { r: 3, fill: color } : false} 
                        activeDot={{ r: 6 }} 
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* IN-DEPTH HISTORICAL BILLS LEDGER */}
          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>In-Depth Historical Archives</h3>

              {/* Month Selector Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {historyArchives.map((archive) => (
                  <button
                    key={archive.month}
                    onClick={() => setSelectedHistoryMonth(archive.month)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      background: selectedHistoryMonth === archive.month ? 'var(--accent-color)' : 'var(--bg-color)',
                      color: selectedHistoryMonth === archive.month ? '#FFFFFF' : 'var(--text-primary)',
                      border: `1px solid ${selectedHistoryMonth === archive.month ? 'var(--accent-color)' : 'var(--border-color)'}`,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {archive.month} (₹{archive.totalPaid.toLocaleString()})
                  </button>
                ))}
              </div>
            </div>

            {/* Archived Month Detail Table */}
            {currentArchivedDetail && (
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', background: 'var(--bg-color)' }}>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Archived Expense</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Category</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Amount Paid</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'center' }}>Archived Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentArchivedDetail.bills.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{item.name}</td>
                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>
                          <span style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}>
                            {item.category}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                          ₹{Number(item.amount).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <span style={{ background: 'rgba(6,78,59,0.1)', color: '#064E3B', padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 700 }}>
                            PAID & ARCHIVED
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
};

export default MonthlyTracker;
