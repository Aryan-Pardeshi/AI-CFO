import React, { useEffect, useRef, useState } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { errStyle, inputStyle } from '../../components/onboarding/styles.js';
import {
  buildGoalPayload, fractionToPercent, goalDefaultName, goalRowSync, GOAL_TYPE_LABELS,
  paiseToRupees, percentToFraction, serverIdOf, ageFromDob, parseRupeesField,
} from '../../lib/onboarding.js';
import { createGoal, deleteGoal, listGoals, updateGoal } from '../../lib/api.js';

const GOAL_TYPE_OPTIONS = ['CAR', 'WEDDING', 'HOUSE_DOWN_PAYMENT', 'EDUCATION', 'TRAVEL', 'OTHER'];

const Goals = ({ profile, saveAndAdvance, goBack }) => {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const idRef = useRef(2);
  const [goals, setGoals] = useState([]);
  const dob = profile?.date_of_birth;

  useEffect(() => {
    let cancelled = false;
    listGoals()
      .then((items) => {
        if (cancelled || !Array.isArray(items)) return;
        if (items.length > 0) {
          setGoals(items.map((g) => ({
            id: `srv-${g.goal_id}`,
            server_id: g.goal_id,
            goal_type: g.goal_type,
            name: g.name ?? goalDefaultName(g.goal_type),
            amount: paiseToRupees(g.amount_today_paise),
            target_age: g.target_age === null || g.target_age === undefined ? '' : String(g.target_age),
            inflation_rate: g.inflation_rate === null || g.inflation_rate === undefined ? '' : String(fractionToPercent(g.inflation_rate)),
          })));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function addGoalRow() {
    const id = `goal-${idRef.current}`;
    idRef.current += 1;
    setGoals((prev) => [...prev, { id, goal_type: 'HOUSE_DOWN_PAYMENT', name: goalDefaultName('HOUSE_DOWN_PAYMENT'), amount: '', target_age: '', inflation_rate: '', server_id: null }]);
  }

  function editGoal(id, field, value) {
    setGoals((prev) => prev.map((g) => {
      if (g.id !== id) return g;
      if (field === 'goal_type') {
        const prevDefault = goalDefaultName(g.goal_type);
        // Keep a custom name, but follow the type default otherwise.
        const name = (g.name.trim() === '' || g.name === prevDefault) ? goalDefaultName(value) : g.name;
        const def = value === 'EDUCATION' ? '10' : '6';
        return { ...g, goal_type: value, name, inflation_rate: g.inflation_rate === '' ? def : g.inflation_rate };
      }
      return { ...g, [field]: value };
    }));
  }

  async function removeGoalRow(id) {
    const row = goals.find((g) => g.id === id);
    if (row?.server_id) {
      try {
        await deleteGoal(row.server_id);
      } catch (err) {
        setFormError(err?.message || 'Could not delete goal');
        return;
      }
    }
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  async function continueFromStep7(skipped = false) {
    const age = ageFromDob(dob);
    if (skipped && goals.length === 0) {
      setSaving(true);
      setFormError('');
      try {
        await saveAndAdvance(8, {});
        setErrors({});
      } catch (err) {
        setFormError(err?.message || 'Could not save progress');
      } finally {
        setSaving(false);
      }
      return;
    }
    const next = {};
    const toSave = [];
    for (const g of goals) {
      if (goalRowSync(g) === 'skip') continue;
      if (!g.name.trim()) next[`goal_${g.id}_name`] = 'Name is required';
      const amt = parseRupeesField('Amount', g.amount);
      if (amt.error) next[`goal_${g.id}_amount`] = amt.error;
      const ta = Number(g.target_age);
      const minAge = (age ?? 18) + 1;
      if (!Number.isInteger(ta) || ta < minAge || ta > 91) {
        next[`goal_${g.id}_age`] = `Target age must be ${minAge}–91`;
      }
      const inflPercent = g.inflation_rate.trim() === '' ? (g.goal_type === 'EDUCATION' ? 10 : 6) : Number(g.inflation_rate);
      if (!Number.isFinite(inflPercent) || inflPercent < 0 || inflPercent > 100) next[`goal_${g.id}_infl`] = 'Inflation must be 0–100%';
      const infl = percentToFraction(inflPercent);
      if (!next[`goal_${g.id}_name`] && !next[`goal_${g.id}_amount`] && !next[`goal_${g.id}_age`] && !next[`goal_${g.id}_infl`]) {
        toSave.push({ row: g, amount: amt.paise, age: ta, infl });
      }
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      for (const { row, amount, age: ta, infl } of toSave) {
        const payload = buildGoalPayload({
          name: row.name.trim(),
          goalType: row.goal_type,
          amountPaise: amount,
          targetAge: ta,
          inflationRate: infl,
        });
        if (row.server_id) {
          await updateGoal(row.server_id, payload);
        } else {
          const created = await createGoal(payload);
          const newId = serverIdOf(created, null);
          setGoals((prev) => prev.map((x) => (x.id === row.id ? { ...x, server_id: newId } : x)));
        }
      }
      await saveAndAdvance(8, {});
      setErrors({});
    } catch (err) {
      setFormError(err?.message || 'Could not save goals');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {formError && <div style={{ color: 'var(--error-color)', marginBottom: '1rem', fontSize: '0.875rem' }}>{formError}</div>}
      <p style={{ color: 'var(--text-secondary)' }}>Goals are optional. Amount is in today&apos;s rupees; inflation defaults to 10% for education, 6% otherwise.</p>
      {goals.map((g) => (
        <div key={g.id} style={{ border: '1px solid var(--border-color)', padding: '1rem', marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Goal type</label>
            <select value={g.goal_type} onChange={(e) => editGoal(g.id, 'goal_type', e.target.value)} style={inputStyle}>
              {GOAL_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{GOAL_TYPE_LABELS[o] ?? o}</option>)}
            </select>
          </div>
          <div>
            <Input label="Name" id={`goal-name-${g.id}`} value={g.name} onChange={(e) => editGoal(g.id, 'name', e.target.value)} placeholder="Retirement corpus" />
            {errors[`goal_${g.id}_name`] && <div style={errStyle}>{errors[`goal_${g.id}_name`]}</div>}
          </div>
          <div>
            <Input label="Amount today (₹)" id={`goal-amt-${g.id}`} value={g.amount} onChange={(e) => editGoal(g.id, 'amount', e.target.value)} placeholder="5000000" />
            {errors[`goal_${g.id}_amount`] && <div style={errStyle}>{errors[`goal_${g.id}_amount`]}</div>}
          </div>
          <div>
            <Input label="Target age" id={`goal-age-${g.id}`} value={g.target_age} onChange={(e) => editGoal(g.id, 'target_age', e.target.value)} placeholder="60" />
            {errors[`goal_${g.id}_age`] && <div style={errStyle}>{errors[`goal_${g.id}_age`]}</div>}
          </div>
          <div>
            <Input label="Inflation rate (%)" id={`goal-infl-${g.id}`} value={g.inflation_rate} onChange={(e) => editGoal(g.id, 'inflation_rate', e.target.value)} placeholder={g.goal_type === 'EDUCATION' ? '10' : '6'} />
            {errors[`goal_${g.id}_infl`] && <div style={errStyle}>{errors[`goal_${g.id}_infl`]}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" onClick={() => removeGoalRow(g.id)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>Remove goal</button>
          </div>
        </div>
      ))}
      <div style={{ marginTop: '1rem' }}>
        <Button variant="outline" onClick={addGoalRow}>+ Add a goal</Button>
      </div>
      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outline" onClick={goBack}>Back</Button>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Button variant="outline" onClick={() => continueFromStep7(true)} disabled={saving}>Skip</Button>
          <Button onClick={() => continueFromStep7(false)} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
        </div>
      </div>
    </div>
  );
};

export default Goals;
