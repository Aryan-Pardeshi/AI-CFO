import React, { useState } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const Milestones = () => {
  const [milestones, setMilestones] = useState([
    { id: 1, title: 'Emergency Fund', target: 500000, current: 350000, deadline: '2027-12-31' },
    { id: 2, title: 'Downpayment for Home', target: 2000000, current: 400000, deadline: '2029-06-30' },
  ]);

  const [newTitle, setNewTitle] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newCurrent, setNewCurrent] = useState('');
  const [newDeadline, setNewDeadline] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newTitle || !newTarget) return;
    
    setMilestones([
      ...milestones, 
      { 
        id: Date.now(), 
        title: newTitle, 
        target: Number(newTarget), 
        current: Number(newCurrent) || 0, 
        deadline: newDeadline 
      }
    ]);
    
    setNewTitle('');
    setNewTarget('');
    setNewCurrent('');
    setNewDeadline('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Financial Milestones</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Track your progress towards major financial goals.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {milestones.map(m => {
          const progress = Math.min(100, Math.round((m.current / m.target) * 100));
          return (
            <div key={m.id} style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{m.title}</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Target: {m.deadline}</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>₹{m.current.toLocaleString()}</span>
                <span style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>/ ₹{m.target.toLocaleString()}</span>
              </div>
              
              <div style={{ width: '100%', height: '8px', background: 'var(--bg-color)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent-color)' }}></div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.75rem', marginTop: '0.5rem', fontWeight: 600 }}>
                {progress}% Complete
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '2rem', marginTop: '1rem' }}>
        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>Add New Milestone</h3>
        <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <Input label="Goal Title" id="m-title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Vacation Fund" required />
          <Input label="Target Amount (₹)" id="m-target" type="number" value={newTarget} onChange={e => setNewTarget(e.target.value)} placeholder="e.g. 100000" required />
          <Input label="Current Amount Saved (₹)" id="m-current" type="number" value={newCurrent} onChange={e => setNewCurrent(e.target.value)} placeholder="e.g. 20000" />
          <Input label="Target Date" id="m-date" type="date" value={newDeadline} onChange={e => setNewDeadline(e.target.value)} required />
          <div style={{ gridColumn: 'span 2' }}>
            <Button type="submit">Create Milestone</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Milestones;
