import React, { useEffect, useRef, useState } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { getMe, listGoals, createGoal, updateGoal } from '../../lib/api.js';
import { contributionDeltaPaise, createGoalPayload, mapGoalToMilestone } from '../../lib/goalMapper.js';
import { formatPaise } from '../../lib/money.js';
import { useAuth } from '../../context/AuthContext';
import { FiPlusCircle, FiX } from 'react-icons/fi';

const Milestones = () => {
  const { userEmail } = useAuth();
  const [milestones, setMilestones] = useState([]);
  const [rawGoals, setRawGoals] = useState([]);
  const [dateOfBirth, setDateOfBirth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newCurrent, setNewCurrent] = useState('');
  const [newDeadline, setNewDeadline] = useState('');

  const [contributeItem, setContributeItem] = useState(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [contributeBusy, setContributeBusy] = useState(false);
  const [contributeError, setContributeError] = useState('');
  const [toast, setToast] = useState('');
  const contributeAmountRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  // Clear any pending "toast" auto-dismiss timer on unmount so it never
  // fires setState after the component is gone.
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const loadMilestones = async () => {
    setLoading(true);
    setError('');
    try {
      const [profile, goals] = await Promise.all([getMe(), listGoals()]);
      const list = Array.isArray(goals) ? goals : [];
      setDateOfBirth(profile?.date_of_birth || null);
      setRawGoals(list);
      setMilestones(list.map(mapGoalToMilestone));
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
      const refreshed = await listGoals();
      const list = Array.isArray(refreshed) ? refreshed : [...rawGoals, createdGoal];
      setRawGoals(list);
      setMilestones(list.map(mapGoalToMilestone));
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

  const openContribute = (milestone) => {
    setContributeItem(milestone);
    setContributeAmount('');
    setContributeError('');
  };

  const closeContribute = () => {
    if (contributeBusy) return;
    setContributeItem(null);
    setContributeAmount('');
    setContributeError('');
  };

  // Move focus into the dialog when it opens (WAI-ARIA modal dialog pattern).
  useEffect(() => {
    if (contributeItem) {
      contributeAmountRef.current?.focus();
    }
  }, [contributeItem]);

  // Escape closes the dialog, but never while a save is in flight.
  useEffect(() => {
    if (!contributeItem) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeContribute();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contributeItem, contributeBusy]);

  const handleContribute = async (event) => {
    event.preventDefault();
    if (!contributeItem || contributeBusy) return;
    setContributeError('');
    // Refetch first so a contribution never accumulates on top of stale state.
    setContributeBusy(true);
    try {
      const fresh = await listGoals();
      const list = Array.isArray(fresh) ? fresh : [];
      const current = list.find((goal) => goal.goal_id === contributeItem.id);
      if (!current) {
        throw new Error('That goal no longer exists. Refresh the list and try again.');
      }
      const { deltaPaise, nextSavedPaise } = contributionDeltaPaise(current.current_saved_paise, contributeAmount);
      const updated = await updateGoal(current.goal_id, { current_saved_paise: nextSavedPaise });
      // Re-fetch so the list reflects the server's canonical goal, not a
      // client-computed guess — updateGoal's response is the source of truth here.
      const merged = list.map((goal) => (goal.goal_id === current.goal_id ? { ...goal, ...updated } : goal));
      setRawGoals(merged);
      setMilestones(merged.map(mapGoalToMilestone));
      setToast(`Added ${formatPaise(deltaPaise)} to ${current.name || 'your goal'}.`);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setToast('');
        toastTimeoutRef.current = null;
      }, 4000);
      setContributeItem(null);
      setContributeAmount('');
    } catch (err) {
      setContributeError(err?.message || 'Could not save that contribution. Please try again.');
    } finally {
      setContributeBusy(false);
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

      {toast && (
        <div role="status" style={{ background: 'rgba(6,78,59,0.1)', border: '1px solid #064E3B', color: '#064E3B', padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '1.5rem' }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)' }}>Loading your milestones...</div>
        ) : error ? null : milestones.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)' }}>No milestones saved yet. Add your first financial goal below.</div>
        ) : milestones.map(m => {
          const progress = m.target > 0 ? Math.min(100, Math.round((m.current / m.target) * 100)) : 0;
          const remaining = Math.max(0, Math.round((m.target - m.current) * 100) / 100);
          return (
            <div key={m.id} style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{m.title}</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Target: {m.deadline}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>₹{m.current.toLocaleString('en-IN')}</span>
                <span style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>/ ₹{m.target.toLocaleString('en-IN')}</span>
              </div>

              <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${m.title} progress`} style={{ width: '100%', height: '8px', background: 'var(--bg-color)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent-color)' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>₹{remaining.toLocaleString('en-IN')} to go</span>
                <span style={{ fontWeight: 600 }}>{progress}% complete</span>
              </div>
              <div>
                <Button type="button" variant="outline" onClick={() => openContribute(m)} style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                  <FiPlusCircle size={14} style={{ marginRight: '0.35rem' }} /> Contribute
                </Button>
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

      {contributeItem && (
        <div role="dialog" aria-modal="true" aria-label={`Contribute to ${contributeItem.title}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: 'clamp(1.25rem, 6vw, 2rem)', width: '100%', maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Contribute to {contributeItem.title}</h3>
              <button type="button" onClick={closeContribute} aria-label="Close contribution dialog" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <FiX size={20} />
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0' }}>
              Current savings: <strong>₹{contributeItem.current.toLocaleString('en-IN')}</strong> of ₹{contributeItem.target.toLocaleString('en-IN')} goal.
            </p>
            <form onSubmit={handleContribute} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="contribute-amount" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Contribution amount (₹)</label>
                <input
                  id="contribute-amount"
                  ref={contributeAmountRef}
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="e.g. 5000"
                  value={contributeAmount}
                  onChange={(e) => setContributeAmount(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }}
                />
              </div>
              {contributeError && (
                <div role="alert" style={{ fontSize: '0.85rem', color: 'var(--error-color)' }}>{contributeError}</div>
              )}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <Button type="submit" disabled={contributeBusy}>{contributeBusy ? 'Saving…' : 'Confirm contribution'}</Button>
                <Button variant="outline" type="button" onClick={closeContribute} disabled={contributeBusy}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Milestones;
