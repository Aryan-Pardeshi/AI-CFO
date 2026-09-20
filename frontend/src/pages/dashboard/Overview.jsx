import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getCashflowSummary, getDashboardProfile } from '../../lib/dashboardApi.js';
import { mapCashflowSummary } from '../../lib/cashflow.js';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { FiActivity, FiPieChart, FiArrowUpRight, FiArrowDownRight, FiTrendingUp } from 'react-icons/fi';

const COLORS = ['#059669', '#D97706', '#2563EB', '#7C3AED', '#DB2777', '#0D9488'];

const StatCard = ({ title, amount, subtitle, icon, iconBg, valueColor = 'var(--text-primary)' }) => (
  <div style={{
    background: 'var(--surface-color)',
    padding: '1.5rem',
    borderRadius: 'var(--radius-md, 12px)',
    border: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-sm)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    flex: 1,
    minWidth: '220px',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        {title}
      </span>
      {icon && (
        <div style={{
          width: '34px',
          height: '34px',
          borderRadius: '8px',
          background: iconBg || 'var(--surface-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {icon}
        </div>
      )}
    </div>
    <div style={{ fontSize: '1.85rem', fontWeight: 700, color: valueColor, letterSpacing: '-0.02em' }}>
      {amount}
    </div>
    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
      {subtitle}
    </div>
  </div>
);

const Overview = () => {
  const { userEmail } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cashflow, setCashflow] = useState({ points: [], totals: { income: 0, expenses: 0, net: 0 }, hasHistory: false });
  const [cashflowError, setCashflowError] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      const [profileResult, cashflowResult] = await Promise.allSettled([getDashboardProfile(), getCashflowSummary()]);
      if (profileResult.status === 'fulfilled') setData(profileResult.value?.user?.financials || null);
      if (cashflowResult.status === 'fulfilled') {
        setCashflow(mapCashflowSummary(cashflowResult.value));
      } else {
        setCashflowError(cashflowResult.reason?.message || 'Cash-flow history is unavailable right now.');
      }
      setLoading(false);
    };
    if (userEmail) fetchUser();
  }, [userEmail]);

  if (loading) return <div>Loading dashboard...</div>;
  if (!data) return <div>No financial data found. Please complete onboarding.</div>;

  // --- Compute metrics ---
  const incomes = data.incomes || {};
  const totalIncome = Object.values(incomes).reduce((acc, val) => acc + (Number(val) || 0), 0);
  
  const expenses = data.monthlyExpenses || {};
  const totalExpenses = Object.values(expenses).reduce((acc, val) => acc + (Number(val) || 0), 0);
  
  const liabilities = data.liabilities || {};
  const totalEmi = Object.values(liabilities).reduce((acc, val) => acc + (Number(val) || 0), 0);

  const totalOutflow = totalExpenses + totalEmi;
  const netSurplus = totalIncome - totalOutflow;
  const savingsRate = totalIncome > 0 ? ((netSurplus / totalIncome) * 100).toFixed(1) : 0;

  // Chart data formatting
  const expenseData = Object.entries(expenses)
    .filter(([_, val]) => Number(val) > 0)
    .map(([name, val]) => ({ name: name.toUpperCase(), value: Number(val) }))
    .sort((a, b) => b.value - a.value);

  const totalExpenseValue = expenseData.reduce((acc, item) => acc + item.value, 0);

  // Top liabilities for bar chart
  const liabilityData = Object.entries(liabilities)
    .filter(([_, val]) => Number(val) > 0)
    .map(([name, val]) => ({ name: name.replace(/([A-Z])/g, ' $1').toUpperCase(), value: Number(val) }))
    .sort((a, b) => b.value - a.value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* 1. STAT CARDS */}
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        <StatCard 
          title="Period Outflows" 
          amount={`₹${totalOutflow.toLocaleString()}`} 
          subtitle="Current month expenses & EMIs" 
          valueColor="#EF4444"
          icon={<FiArrowDownRight size={18} color="#EF4444" />}
          iconBg="rgba(239, 68, 68, 0.1)"
        />
        <StatCard 
          title="Period Inflows" 
          amount={`₹${totalIncome.toLocaleString()}`} 
          subtitle="Total recognized earnings" 
          valueColor="#059669"
          icon={<FiArrowUpRight size={18} color="#059669" />}
          iconBg="rgba(16, 185, 129, 0.1)"
        />
        <StatCard 
          title="Net Surplus" 
          amount={`${netSurplus >= 0 ? '+' : ''}₹${netSurplus.toLocaleString()}`} 
          subtitle="Capital retained" 
          valueColor={netSurplus >= 0 ? '#059669' : '#EF4444'}
          icon={<FiActivity size={18} color={netSurplus >= 0 ? "#059669" : "#EF4444"} />}
          iconBg={netSurplus >= 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)"}
        />
        <StatCard 
          title="Savings Ratio" 
          amount={`${savingsRate}%`} 
          subtitle="Benchmark: 20%+" 
          valueColor="var(--text-primary)"
          icon={<FiPieChart size={18} color="#D97706" />}
          iconBg="rgba(217, 119, 6, 0.1)"
        />
      </div>

      {/* 2. FIRE PREVIEW HERO BANNER */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.08) 0%, rgba(16, 185, 129, 0.12) 50%, var(--surface-color) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.28)',
        borderRadius: 'var(--radius-lg, 16px)',
        padding: '1.75rem 2rem',
        display: 'flex',
        gap: '1.5rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 20px -4px rgba(6, 78, 59, 0.12)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', minWidth: '280px', flex: '2 1 320px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #064E3B 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
            flexShrink: 0
          }}>
            <FiTrendingUp size={24} color="#FFFFFF" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span style={{
                fontSize: '0.725rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: '#059669',
                background: 'rgba(5, 150, 105, 0.12)',
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px'
              }}>
                Retirement readiness
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                • Monte Carlo Powered
              </span>
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>
              Projected FIRE Age & Required Corpus
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              See your projected FIRE age and required corpus, under these assumptions from your saved profile.
            </p>
          </div>
        </div>
        <Link
          to="/fire"
          className="btn"
          style={{
            padding: '0.85rem 1.75rem',
            textDecoration: 'none',
            fontSize: '0.925rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            borderRadius: '10px',
            boxShadow: '0 4px 14px rgba(6, 78, 59, 0.3)'
          }}
        >
          View FIRE forecast →
        </Link>
      </div>

      {/* 3. EXECUTIVE AUDIT (Insights) */}
      <div>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
          Executive Audit & Priority Insights
        </h3>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
          {savingsRate < 20 && (
            <div style={{
              flex: 1,
              minWidth: '280px',
              borderRadius: 'var(--radius-md, 12px)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderLeft: '4px solid #EF4444',
              padding: '1.5rem',
              background: 'var(--surface-color)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '0.25rem 0.6rem', fontSize: '0.7rem', fontWeight: 700, borderRadius: '9999px', marginBottom: '0.75rem' }}>
                ● RED FLAG
              </div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Savings Rate is Only {savingsRate}%</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
                You've saved ₹{netSurplus.toLocaleString()} out of ₹{totalIncome.toLocaleString()} income. ARIA recommends 20%+ to build long-term wealth.
              </p>
              <a href="#" style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>Simulate Savings Increase →</a>
            </div>
          )}
          {expenseData.length > 0 && (
            <div style={{
              flex: 1,
              minWidth: '280px',
              borderRadius: 'var(--radius-md, 12px)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderLeft: '4px solid #F59E0B',
              padding: '1.5rem',
              background: 'var(--surface-color)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(245, 158, 11, 0.1)', color: '#D97706', padding: '0.25rem 0.6rem', fontSize: '0.7rem', fontWeight: 700, borderRadius: '9999px', marginBottom: '0.75rem' }}>
                ● REVIEW
              </div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>High {expenseData[0].name} Spending</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
                You are spending ₹{expenseData[0].value.toLocaleString()} per month on {expenseData[0].name.toLowerCase()}. Review if all expenses are actively needed.
              </p>
              <a href="#" style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>Review Transactions →</a>
            </div>
          )}
        </div>
      </div>

      {/* 4. CHARTS ROW */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {/* Category Allocation */}
        <div style={{ flex: 1, minWidth: '320px', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg, 16px)', border: '1px solid var(--border-color)', padding: '1.75rem', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1.5rem' }}>Category Allocation</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expenseData} innerRadius={80} outerRadius={120} paddingAngle={5} dataKey="value">
                  {expenseData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {expenseData.length > 0 && (
            <ul
              role="list"
              aria-label="Category allocation legend"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',
                gap: '0.75rem',
                marginTop: '1.5rem',
                padding: 0,
                listStyle: 'none',
              }}
            >
              {expenseData.map((entry, index) => {
                const color = COLORS[index % COLORS.length];
                const percentage = totalExpenseValue > 0 ? (entry.value / totalExpenseValue) * 100 : 0;
                const formattedPercentage = percentage % 1 === 0 ? `${percentage.toFixed(0)}%` : `${percentage.toFixed(1)}%`;

                return (
                  <li
                    key={entry.name}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md, 12px)',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border-color)',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <span
                        role="img"
                        aria-label={`${entry.name} color swatch`}
                        title={`${entry.name} color`}
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        title={entry.name}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.name}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        ₹{entry.value.toLocaleString('en-IN')}
                      </span>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {formattedPercentage}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        
        {/* Cashflow Velocity */}
        <div style={{ flex: 2, minWidth: '360px', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg, 16px)', border: '1px solid var(--border-color)', padding: '1.75rem', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1.5rem' }}>Historical Cashflow Velocity</h3>
          <div style={{ height: '300px' }}>
            {cashflow.hasHistory ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cashflow.points}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val / 1000}k`} />
                  <Tooltip formatter={(value) => `₹${Number(value).toLocaleString()}`} />
                  <Line type="monotone" dataKey="Income" stroke="#059669" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="Expenses" stroke="#EF4444" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                {cashflowError || 'No committed cash-flow history yet. Your current snapshot will appear after the first reviewed statement.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. LISTS ROW */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '320px', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg, 16px)', border: '1px solid var(--border-color)', padding: '1.75rem', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1.5rem' }}>Top Counterparties (Volume)</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={liabilityData} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                <Bar dataKey="value" fill="#D97706" radius={[0, 6, 6, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: '320px', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg, 16px)', border: '1px solid var(--border-color)', padding: '1.75rem', overflowY: 'auto', maxHeight: '380px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1.5rem' }}>Fixed Commitments</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {liabilityData.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Recurring Monthly</div>
                </div>
                <div style={{ fontWeight: 600, color: '#EF4444' }}>
                  ₹{item.value.toLocaleString()}/mo
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

export default Overview;
