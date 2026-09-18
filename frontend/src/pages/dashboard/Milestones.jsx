import React, { useEffect, useState } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { getMe, listGoals, createGoal } from '../../lib/api.js';
import { createGoalPayload, mapGoalToMilestone } from '../../lib/goalMapper.js';
import { useAuth } from '../../context/AuthContext';

const Milestones = () => {
  const { userEmail } = useAuth();
  const [milestones, setMilestones] = useState([]);
  const [dateOfBirth, setDateOfBirth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newCurrent, setNewCurrent] = useState('');
  const [newDeadline, setNewDeadline] = useState('');

  const loadMilestones = async () => {
    setLoading(true);
    setError('');
    try {
      const [profile, goals] = await Promise.all([getMe(), listGoals()]);
      setDateOfBirth(profile?.date_of_birth || null);
      setMilestones((Array.isArray(goals) ? goals : []).map(mapGoalToMilestone));
    } catch (err) {
      setError(err?.message || 'Unable to load your milestones right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userEmail) loadMilestones();
  }, [userEmail]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = createGoalPayload({
        title: newTitle,
        targetRupees: newTarget,
        currentSavedRupees: newCurrent,
        targetDate: newDeadline,
        dateOfBirth,
      });
      setSubmitting(true);
      const createdGoal = await createGoal(payload);
      setMilestones((current) => [...current, mapGoalToMilestone(createdGoal)]);
      setNewTitle('');
      setNewTarget('');
      setNewCurrent('');
      setNewDeadline('');
    } catch (err) {
      setError(err?.message || 'Unable to create this milestone.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Financial Milestones</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Track your progress towards major financial goals.</p>
      </div>

      {error && (
        <div role="alert" style={{ color: '#B91C1C', border: '1px solid #B91C1C', padding: '1rem' }}>
          {error}
          <Button type="button" variant="outline" onClick={loadMilestones} style={{ marginLeft: '1rem' }}>
            Try again
          </Button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)' }}>Loading your milestones...</div>
        ) : milestones.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)' }}>No milestones saved yet. Add your first financial goal below.</div>
        ) : milestones.map(m => {
          const progress = m.target > 0 ? Math.min(100, Math.round((m.current / m.target) * 100)) : 0;
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
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Create Milestone'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Milestones;
