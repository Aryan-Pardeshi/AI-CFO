import React, { useState } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { errStyle, inputStyle } from '../../components/onboarding/styles.js';
import { RISK_PROFILE_LABELS, STRATEGY_GOAL_LABELS } from '../../lib/onboarding.js';
import { RISK_QUESTIONS, explainRiskSuggestion, scoreRiskAnswers, suggestRiskProfile } from '../../lib/risk.js';

const STRATEGY_GOAL_OPTIONS = ['WEALTH_GROWTH', 'INCOME', 'CAPITAL_PRESERVATION', 'FIRE'];

const RiskStrategy = ({ profile, saveAndAdvance, goBack }) => {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [riskAnswers, setRiskAnswers] = useState(() => (
    Array.isArray(profile?.risk_answers) && profile.risk_answers.length === 4 ? profile.risk_answers : [null, null, null, null]
  ));
  const [riskOverride, setRiskOverride] = useState(() => profile?.risk_profile || '');
  const [horizonYears, setHorizonYears] = useState(() => (
    profile?.investment_horizon_years !== null && profile?.investment_horizon_years !== undefined
      ? String(profile.investment_horizon_years) : ''
  ));
  const [strategyGoal, setStrategyGoal] = useState(() => profile?.strategy_goal || 'WEALTH_GROWTH');

  async function continueFromStep6() {
    const next = {};
    if (riskAnswers.some((a) => a === null)) next.riskAnswers = 'Answer all 4 questions';
    const hy = Number(horizonYears);
    if (horizonYears.trim() === '' || !Number.isInteger(hy) || hy < 1 || hy > 60) {
      next.horizonYears = 'Horizon must be 1–60 years';
    }
    let score = null;
    try {
      score = scoreRiskAnswers(riskAnswers);
    } catch {
      next.riskAnswers = 'Answer all 4 questions';
    }
    const suggested = score === null ? null : suggestRiskProfile(score);
    const finalProfile = riskOverride || suggested;
    if (!finalProfile) next.riskOverride = 'Pick a risk profile';
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await saveAndAdvance(7, {
        risk_score: score,
        risk_answers: riskAnswers,
        risk_profile: finalProfile,
        investment_horizon_years: hy,
        strategy_goal: strategyGoal,
      });
      setErrors({});
    } catch (err) {
      setFormError(err?.message || 'Could not save progress');
    } finally {
      setSaving(false);
    }
  }

  let riskScore = null;
  let suggested = null;
  try {
    if (riskAnswers.every((a) => a !== null)) {
      riskScore = scoreRiskAnswers(riskAnswers);
      suggested = suggestRiskProfile(riskScore);
    }
  } catch {
    riskScore = null;
  }

  return (
    <div>
      {formError && <div style={{ color: 'var(--error-color)', marginBottom: '1rem', fontSize: '0.875rem' }}>{formError}</div>}
      {RISK_QUESTIONS.map((q, qi) => (
        <div key={q.key} style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontWeight: 600 }}>{qi + 1}. {q.question}</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {q.options.map((o) => (
              <button
                key={o.points}
                type="button"
                onClick={() => setRiskAnswers((prev) => prev.map((v, i) => (i === qi ? o.points : v)))}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid var(--border-color)',
                  background: riskAnswers[qi] === o.points ? 'var(--accent-color)' : 'transparent',
                  color: riskAnswers[qi] === o.points ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {errors.riskAnswers && <div style={errStyle}>{errors.riskAnswers}</div>}
      {suggested && (
        <div style={{ border: '1px solid var(--border-color)', padding: '1rem', marginBottom: '1.5rem' }}>
          <p><strong>Suggested: {RISK_PROFILE_LABELS[suggested] ?? suggested}</strong> (score {riskScore} of 12)</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{explainRiskSuggestion(riskScore)}</p>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.8rem' }}>Risk profile (you can override)</label>
          <select value={riskOverride || suggested || ''} onChange={(e) => setRiskOverride(e.target.value)} style={inputStyle}>
            <option value="">Use suggestion{suggested ? ` (${RISK_PROFILE_LABELS[suggested] ?? suggested})` : ''}</option>
            <option value="CONSERVATIVE">{RISK_PROFILE_LABELS.CONSERVATIVE}</option>
            <option value="MODERATE">{RISK_PROFILE_LABELS.MODERATE}</option>
            <option value="AGGRESSIVE">{RISK_PROFILE_LABELS.AGGRESSIVE}</option>
          </select>
        </div>
        <div>
          <Input label="Investment horizon (years)" id="horizonYears" value={horizonYears} onChange={(e) => setHorizonYears(e.target.value)} placeholder="10" />
          {errors.horizonYears && <div style={errStyle}>{errors.horizonYears}</div>}
        </div>
        <div>
          <label style={{ fontSize: '0.8rem' }}>Strategy goal</label>
          <select value={strategyGoal} onChange={(e) => setStrategyGoal(e.target.value)} style={inputStyle}>
            {STRATEGY_GOAL_OPTIONS.map((o) => <option key={o} value={o}>{STRATEGY_GOAL_LABELS[o] ?? o}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outline" onClick={goBack}>Back</Button>
        <Button onClick={continueFromStep6} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
      </div>
    </div>
  );
};

export default RiskStrategy;
