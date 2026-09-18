import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, updateProfile } from '../lib/api.js';
import Consent from './onboarding/Consent';
import AboutYou from './onboarding/AboutYou';
import MonthlyMoney from './onboarding/MonthlyMoney';
import Holdings from './onboarding/Holdings';
import Loans from './onboarding/Loans';
import RiskStrategy from './onboarding/RiskStrategy';
import Goals from './onboarding/Goals';
import Finish from './onboarding/Finish';

const STEP_TITLES = ['Consent', 'About you', 'Monthly money', 'What you have', 'Loans', 'Risk & strategy', 'Goals', 'Finish'];
const STEP_PAGES = [null, Consent, AboutYou, MonthlyMoney, Holdings, Loans, RiskStrategy, Goals, Finish];

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getMe()
      .then((nextProfile) => {
        if (!mounted) return;
        if (nextProfile?.onboarded) {
          navigate('/dashboard', { replace: true });
          return;
        }
        setProfile(nextProfile || {});
        if (typeof nextProfile?.onboarding_step === 'number' && nextProfile.onboarding_step >= 1 && nextProfile.onboarding_step <= 8) {
          setStep(nextProfile.onboarding_step);
        }
      })
      .catch(() => {
        if (mounted) setProfile({});
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function saveAndAdvance(nextStep, fields = {}) {
    const payload = { onboarding_step: nextStep, ...fields };
    await updateProfile(payload);
    setProfile((prev) => ({ ...(prev || {}), ...payload }));
    setStep(nextStep);
  }

  function goBack() {
    setStep((current) => current - 1);
  }

  if (loading) return <p>Loading…</p>;

  const StepPage = STEP_PAGES[step];

  return (
    <div style={{ width: '100%', maxWidth: '800px', background: 'var(--surface-color)', padding: '3rem', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>{STEP_TITLES[step - 1]}</h2>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>Step {step} of 8</span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        {STEP_TITLES.map((t, i) => (
          <div key={t} style={{ flex: 1, height: '4px', background: i + 1 <= step ? 'var(--accent-color)' : 'var(--border-color)' }} />
        ))}
      </div>
      <StepPage profile={profile || {}} saveAndAdvance={saveAndAdvance} goBack={goBack} />
    </div>
  );
};

export default Onboarding;
