import React, { useState, useEffect } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { FiPlusCircle, FiX, FiCheckCircle, FiShield, FiTrendingUp } from 'react-icons/fi';

const Milestones = () => {
  const { userEmail } = useAuth();
  const [milestones, setMilestones] = useState([
    { id: '1', title: 'Emergency Fund', target: 500000, current: 350000, deadline: '2027-12-31' },
    { id: '2', title: 'Downpayment for Home', target: 2000000, current: 400000, deadline: '2029-06-30' },
  ]);
  const [fullFinancials, setFullFinancials] = useState({});
  const [saving, setSaving] = useState(false);

  // Contribute Modal State
  const [contributeItem, setContributeItem] = useState(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [successToast, setSuccessToast] = useState('');

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newCurrent, setNewCurrent] = useState('');
  const [newDeadline, setNewDeadline] = useState('');

  const fetchUserData = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/auth/user/${encodeURIComponent(userEmail)}`);
      if (res.ok) {
        const json = await res.json();
        const financials = json.user?.financials || {};
        setFullFinancials(financials);
        if (financials.milestones && Array.isArray(financials.milestones) && financials.milestones.length > 0) {
          setMilestones(financials.milestones);
        }
      }
    } catch (err) {
      console.error('Failed to fetch user milestones:', err);
    }
  };

  useEffect(() => {
    if (userEmail) fetchUserData();
  }, [userEmail]);

  const saveMilestonesToBackend = async (updatedMilestones) => {
    try {
      setSaving(true);
      const updatedFinancials = {
        ...fullFinancials,
        milestones: updatedMilestones
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
        setMilestones(updatedMilestones);
        setFullFinancials(updatedFinancials);
      }
    } catch (err) {
      console.error('Failed to save milestones:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newTitle || !newTarget) return;
    
    const newM = { 
      id: Date.now().toString(), 
      title: newTitle, 
      target: Number(newTarget), 
      current: Number(newCurrent) || 0, 
      deadline: newDeadline || '2028-12-31'
    };

    const updated = [...milestones, newM];
    setMilestones(updated);
    saveMilestonesToBackend(updated);
    
    setNewTitle('');
    setNewTarget('');
    setNewCurrent('');
    setNewDeadline('');
  };

  const handleContributeSubmit = (e) => {
    e.preventDefault();
    if (!contributeItem || !contributeAmount) return;

    const addVal = parseFloat(contributeAmount);
    if (isNaN(addVal) || addVal <= 0) return;

    const updated = milestones.map(m =>
      m.id === contributeItem.id
        ? { ...m, current: (Number(m.current) || 0) + addVal }
        : m
    );

    saveMilestonesToBackend(updated);
    setSuccessToast(`Successfully added ₹${addVal.toLocaleString()} towards ${contributeItem.title}!`);
    setTimeout(() => setSuccessToast(''), 4000);

    setContributeItem(null);
    setContributeAmount('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0' }}>Financial Milestones & Savings Goals</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Set targets, track progress, and contribute funds towards Emergency Reserve and major goals.
          </p>
        </div>
        {saving && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Saving to Cloud...</span>}
      </div>

      {/* Success Toast Notification */}
      {successToast && (
        <div style={{ background: 'rgba(6,78,59,0.15)', border: '1px solid #064E3B', color: '#064E3B', padding: '0.85rem 1.25rem', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FiCheckCircle size={18} /> {successToast}
        </div>
      )}

      {/* Milestones Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
        {milestones.map(m => {
          const progress = Math.min(100, Math.round((m.current / m.target) * 100));
          const isEmergencyFund = m.title.toLowerCase().includes('emergency');

          return (
            <div 
              key={m.id} 
              style={{ 
                background: 'var(--surface-color)', 
                border: `1px solid ${isEmergencyFund ? '#064E3B' : 'var(--border-color)'}`, 
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                position: 'relative'
              }}
            >
              {isEmergencyFund && (
                <div style={{ position: 'absolute', top: '-10px', right: '15px', background: '#064E3B', color: '#FFFFFF', padding: '0.15rem 0.6rem', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px' }}>
                  CORE RESERVE
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {isEmergencyFund && <FiShield color="#064E3B" size={18} />}
                    {m.title}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>
                    Target Date: {m.deadline}
                  </span>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Saved Capital</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>
                    ₹{m.current.toLocaleString()}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Target Goal</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    ₹{m.target.toLocaleString()}
                  </div>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div>
                <div style={{ width: '100%', height: '8px', background: 'var(--bg-color)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: isEmergencyFund ? '#064E3B' : 'var(--accent-color)' }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '0.4rem', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>₹{(m.target - m.current > 0 ? m.target - m.current : 0).toLocaleString()} Remaining</span>
                  <span style={{ color: '#064E3B' }}>{progress}% Completed</span>
                </div>
              </div>

              {/* CONTRIBUTE BUTTON (Requested Feature) */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem', display: 'flex', justifyContent: 'flex-end' }}>
                <Button 
                  onClick={() => {
                    setContributeItem(m);
                    setContributeAmount('');
                  }}
                  style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}
                >
                  <FiPlusCircle size={14} style={{ marginRight: '0.35rem' }} /> Contribute Funds
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add New Milestone Form */}
      <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '2rem' }}>
        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>Create Custom Financial Goal</h3>
        <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <Input label="Goal Title" id="m-title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Higher Education, Car Fund" required />
          <Input label="Target Amount (₹)" id="m-target" type="number" value={newTarget} onChange={e => setNewTarget(e.target.value)} placeholder="e.g. 500000" required />
          <Input label="Initial Saved Capital (₹)" id="m-current" type="number" value={newCurrent} onChange={e => setNewCurrent(e.target.value)} placeholder="e.g. 50000" />
          <Input label="Target Date" id="m-date" type="date" value={newDeadline} onChange={e => setNewDeadline(e.target.value)} required />
          <div style={{ gridColumn: 'span 2' }}>
            <Button type="submit">Add Milestone Goal</Button>
          </div>
        </form>
      </div>

      {/* ── CONTRIBUTE MODAL POPUP ── */}
      {contributeItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '2rem', width: '100%', maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Contribute to {contributeItem.title}</h3>
              <button onClick={() => setContributeItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <FiX size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0' }}>
              Current Savings: <strong>₹{contributeItem.current.toLocaleString()}</strong> of ₹{contributeItem.target.toLocaleString()} goal.
            </p>

            <form onSubmit={handleContributeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Contribution Amount (₹)</label>
                <input 
                  type="number" 
                  step="any" 
                  required 
                  autoFocus
                  placeholder="e.g. 50000" 
                  value={contributeAmount} 
                  onChange={e => setContributeAmount(e.target.value)} 
                  style={{ width: '100%', padding: '0.65rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }} 
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <Button type="submit">Confirm Contribution</Button>
                <Button variant="outline" type="button" onClick={() => setContributeItem(null)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Milestones;
