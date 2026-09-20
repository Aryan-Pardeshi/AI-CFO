import React, { useState } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { errStyle, inputStyle, nativeSelectOptionStyle } from '../../components/onboarding/styles.js';
import { RISK_PROFILE_LABELS, STRATEGY_GOAL_LABELS } from '../../lib/onboarding.js';
import { RISK_QUESTIONS, RISK_WILLINGNESS_QUESTION, explainRiskSuggestion, scoreRiskAnswers, suggestRiskProfile } from '../../lib/risk.js';

const STRATEGY_GOAL_OPTIONS = ['WEALTH_GROWTH', 'INCOME', 'CAPITAL_PRESERVATION', 'FIRE'];

const RiskStrategy = ({ profile, saveAndAdvance, goBack }) => {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [riskAnswers, setRiskAnswers] = useState(() => (
    Array.isArray(profile?.risk_answers) && profile.risk_answers.length === 4 ? profile.risk_answers : [null, null, null, null]
  ));
  const [riskWillingness, setRiskWillingness] = useState(() => profile?.risk_profile || '');
  const [riskOverride, setRiskOverride] = useState('');
  const [horizonYears, setHorizonYears] = useState(() => (
    profile?.investment_horizon_years !== null && profile?.investment_horizon_years !== undefined
      ? String(profile.investment_horizon_years) : ''
  ));
  const [strategyGoal, setStrategyGoal] = useState(() => profile?.strategy_goal || 'WEALTH_GROWTH');

  async function continueFromStep6() {
    const next = {};
    if (riskAnswers.some((a) => a === null)) next.riskAnswers = 'Answer all four context questions';
    if (!riskWillingness) next.riskWillingness = 'Choose the level of market risk you are comfortable taking';
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
    const finalProfile = riskOverride || riskWillingness || suggested;
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
      <section style={{ borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem', paddingBottom: '1.25rem' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
          Pick what feels true today. There are no right answers—your result is a starting point that you can adjust.
        </p>
      </section>
      {RISK_QUESTIONS.map((q, qi) => (
        <fieldset key={q.key} style={{ border: 0, borderBottom: '1px solid var(--border-subtle)', margin: '0 0 1.25rem', padding: '0 0 1.25rem', minWidth: 0 }}>
          <legend style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 650, lineHeight: 1.4, padding: 0 }}>
            <span style={{ color: 'var(--accent-color)', fontSize: '0.8rem', marginRight: '0.5rem' }}>{String(qi + 1).padStart(2, '0')}</span>
            {q.question}
          </legend>
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            {q.options.map((o) => (
              <button
                key={o.points}
                type="button"
                aria-pressed={riskAnswers[qi] === o.points}
                onClick={() => setRiskAnswers((prev) => prev.map((v, i) => (i === qi ? o.points : v)))}
                style={{
                  padding: '0.65rem 0.9rem',
                  border: riskAnswers[qi] === o.points ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                  background: riskAnswers[qi] === o.points ? 'var(--accent-color)' : 'var(--surface-muted)',
                  color: riskAnswers[qi] === o.points ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  lineHeight: 1.35,
                  textAlign: 'left',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset style={{ border: 0, borderBottom: '1px solid var(--border-subtle)', margin: '0 0 1.25rem', padding: '0 0 1.25rem', minWidth: 0 }}>
        <legend style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 650, lineHeight: 1.4, padding: 0 }}>
          <span style={{ color: 'var(--accent-color)', fontSize: '0.8rem', marginRight: '0.5rem' }}>05</span>
          {RISK_WILLINGNESS_QUESTION.question}
        </legend>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.45, margin: '0.45rem 0 0' }}>{RISK_WILLINGNESS_QUESTION.helper}</p>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          {RISK_WILLINGNESS_QUESTION.options.map((option) => (
            <button
              key={option.profile}
              type="button"
              aria-pressed={riskWillingness === option.profile}
              onClick={() => {
                setRiskWillingness(option.profile);
                setRiskOverride('');
              }}
              style={{
                padding: '0.65rem 0.9rem',
                border: riskWillingness === option.profile ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                background: riskWillingness === option.profile ? 'var(--accent-color)' : 'var(--surface-muted)',
                color: riskWillingness === option.profile ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                lineHeight: 1.35,
                textAlign: 'left',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      {errors.riskAnswers && <div style={errStyle}>{errors.riskAnswers}</div>}
      {errors.riskWillingness && <div style={errStyle}>{errors.riskWillingness}</div>}
      {suggested && (
        <div style={{ border: '1px solid var(--border-color)', padding: '1rem', marginBottom: '1.5rem' }}>
          <p><strong>Context-based profile: {RISK_PROFILE_LABELS[suggested] ?? suggested}</strong> <span style={{ color: 'var(--text-secondary)' }}>(score {riskScore} of 12)</span></p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{explainRiskSuggestion(riskScore)}</p>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div>
          <label htmlFor="risk-profile" style={{ fontSize: '0.8rem' }}>Risk profile (you can override)</label>
          <select id="risk-profile" value={riskOverride || riskWillingness || suggested || ''} onChange={(e) => setRiskOverride(e.target.value)} style={inputStyle}>
            <option value="" style={nativeSelectOptionStyle}>Use suggested profile{suggested ? ` (${RISK_PROFILE_LABELS[suggested] ?? suggested})` : ''}</option>
            <option value="CONSERVATIVE" style={nativeSelectOptionStyle}>{RISK_PROFILE_LABELS.CONSERVATIVE}</option>
            <option value="MODERATE" style={nativeSelectOptionStyle}>{RISK_PROFILE_LABELS.MODERATE}</option>
            <option value="AGGRESSIVE" style={nativeSelectOptionStyle}>{RISK_PROFILE_LABELS.AGGRESSIVE}</option>
          </select>
        </div>
        <div>
          <Input label="Investment horizon (years)" id="horizonYears" value={horizonYears} onChange={(e) => setHorizonYears(e.target.value)} placeholder="10" />
          {errors.horizonYears && <div style={errStyle}>{errors.horizonYears}</div>}
        </div>
        <div>
          <label htmlFor="strategy-goal" style={{ fontSize: '0.8rem' }}>Strategy goal</label>
          <select id="strategy-goal" value={strategyGoal} onChange={(e) => setStrategyGoal(e.target.value)} style={inputStyle}>
            {STRATEGY_GOAL_OPTIONS.map((o) => <option key={o} value={o} style={nativeSelectOptionStyle}>{STRATEGY_GOAL_LABELS[o] ?? o}</option>)}
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
