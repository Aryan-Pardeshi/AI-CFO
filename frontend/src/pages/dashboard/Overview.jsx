import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getCashflowSummary, getDashboardProfile } from '../../lib/dashboardApi.js';
import { mapCashflowSummary } from '../../lib/cashflow.js';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const COLORS = ['#064E3B', '#A16207', '#B45309', '#CA8A04', '#D97706', '#92400E'];

const StatCard = ({ title, amount, subtitle, icon, valueColor = 'var(--text-primary)' }) => (
  <div style={{
    background: 'var(--surface-color)', padding: '1.5rem', border: '1px solid var(--border-color)',
    display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '200px'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        {title}
      </span>
      {icon && <span style={{ color: 'var(--text-secondary)' }}>{icon}</span>}
    </div>
    <div style={{ fontSize: '1.75rem', fontWeight: 600, color: valueColor, fontFamily: 'var(--font-serif)' }}>
      {amount}
    </div>
    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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

  // Top liabilities for bar chart
  const liabilityData = Object.entries(liabilities)
    .filter(([_, val]) => Number(val) > 0)
    .map(([name, val]) => ({ name: name.replace(/([A-Z])/g, ' $1').toUpperCase(), value: Number(val) }))
    .sort((a, b) => b.value - a.value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* 1. STAT CARDS */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <StatCard 
          title="Period Outflows" 
          amount={`₹${totalOutflow.toLocaleString()}`} 
          subtitle="Current month expenses & EMIs" 
          valueColor="#B91C1C"
        />
        <StatCard 
          title="Period Inflows" 
          amount={`₹${totalIncome.toLocaleString()}`} 
          subtitle="Total recognized earnings" 
          valueColor="#064E3B"
        />
        <StatCard 
          title="Net Surplus" 
          amount={`${netSurplus >= 0 ? '+' : ''}₹${netSurplus.toLocaleString()}`} 
          subtitle="Capital retained" 
          valueColor={netSurplus >= 0 ? '#064E3B' : '#B91C1C'}
        />
        <StatCard 
          title="Savings Ratio" 
          amount={`${savingsRate}%`} 
          subtitle="Benchmark: 20%+" 
        />
      </div>

      {/* 2. EXECUTIVE AUDIT (Insights) */}
      <div>
        <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
          Executive Audit & Priority Insights
        </h3>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {savingsRate < 20 && (
            <div style={{ flex: 1, border: '1px solid #FCA5A5', borderLeft: '4px solid #B91C1C', padding: '1.5rem', background: 'var(--surface-color)' }}>
              <div style={{ display: 'inline-block', background: '#FEE2E2', color: '#B91C1C', padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontWeight: 600, borderRadius: '4px', marginBottom: '0.75rem' }}>
                RED FLAG
              </div>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Savings Rate is Only {savingsRate}%</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
                You've saved ₹{netSurplus.toLocaleString()} out of ₹{totalIncome.toLocaleString()} income. ARIA recommends 20%+ to build long-term wealth.
              </p>
              <a href="#" style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>Simulate Savings Increase →</a>
            </div>
          )}
          {expenseData.length > 0 && (
            <div style={{ flex: 1, border: '1px solid #FDE047', borderLeft: '4px solid #CA8A04', padding: '1.5rem', background: 'var(--surface-color)' }}>
              <div style={{ display: 'inline-block', background: '#FEF9C3', color: '#A16207', padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontWeight: 600, borderRadius: '4px', marginBottom: '0.75rem' }}>
                REVIEW
              </div>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>High {expenseData[0].name} Spending</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
                You are spending ₹{expenseData[0].value.toLocaleString()} per month on {expenseData[0].name.toLowerCase()}. Review if all expenses are actively needed.
              </p>
              <a href="#" style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>Review Transactions →</a>
            </div>
          )}
        </div>
      </div>

      {/* 3. CHARTS ROW */}
      <div style={{ display: 'flex', gap: '1.5rem' }}>
        {/* Category Allocation */}
        <div style={{ flex: 1, background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>Category Allocation</h3>
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
        </div>
        
        {/* Cashflow Velocity */}
        <div style={{ flex: 2, background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>Historical Cashflow Velocity</h3>
          <div style={{ height: '300px' }}>
            {cashflow.hasHistory ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cashflow.points}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val / 1000}k`} />
                  <Tooltip formatter={(value) => `₹${Number(value).toLocaleString()}`} />
                  <Line type="monotone" dataKey="Income" stroke="#064E3B" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="Expenses" stroke="#B91C1C" strokeWidth={3} dot={false} />
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

      {/* 4. LISTS ROW */}
      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <div style={{ flex: 1, background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>Top Counterparties (Volume)</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={liabilityData} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                <Bar dataKey="value" fill="#A16207" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ flex: 1, background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem', overflowY: 'auto', maxHeight: '360px' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>Fixed Commitments</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {liabilityData.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Recurring Monthly</div>
                </div>
                <div style={{ fontWeight: 600, color: '#B91C1C' }}>
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
