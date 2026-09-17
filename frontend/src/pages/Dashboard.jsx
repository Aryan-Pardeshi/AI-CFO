import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { getMe } from '../lib/api.js';
import { signOutUser } from '../lib/auth.js';
import { formatPaise } from '../lib/money.js';

function fmt(paise) {
  if (paise === null || paise === undefined) return '—';
  try {
    return formatPaise(paise);
  } catch {
    return '—';
  }
}

const Dashboard = () => {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    getMe()
      .then((p) => {
        if (!mounted) return;
        if (!p || p.onboarded === false) {
          navigate('/onboarding', { replace: true });
          return;
        }
        setProfile(p);
      })
      .catch((err) => {
        if (!mounted) return;
        if (err && (err.status === 404 || err.code === 'NOT_FOUND')) {
          navigate('/onboarding', { replace: true });
          return;
        }
        setError(err?.message || 'Could not load profile');
      });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function handleSignOut() {
    await signOutUser();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ width: '100%', maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <Button variant="outline" style={{ width: 'auto' }} onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
      {error && <div style={{ color: 'var(--error-color)', marginBottom: '1rem' }}>{error}</div>}
      {!profile ? (
        <p>Loading your data…</p>
      ) : (
        <>
          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0 }}>Welcome{profile.name ? `, ${profile.name}` : ''}</h2>
            <p>Monthly income: {fmt(profile.monthly_income_paise)}</p>
            <p>Monthly expenses (excl. EMIs): {fmt(profile.monthly_expenses_paise)}</p>
            <p>Cash balance: {fmt(profile.cash_balance_paise)}</p>
          </div>
          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>Coming soon</h3>
            <p style={{ color: 'var(--text-secondary)' }}>Investments, loans, goals, FIRE projection, and chat will appear here.</p>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
