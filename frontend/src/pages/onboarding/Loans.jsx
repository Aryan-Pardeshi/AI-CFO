import React, { useEffect, useRef, useState } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { errStyle, inputStyle } from '../../components/onboarding/styles.js';
import {
  buildLoanPayload, fractionToPercent, loanRowSync, LOAN_TYPE_LABELS, paiseToRupees, parseRupeesField, percentToFraction, RATE_TYPE_LABELS, serverIdOf,
} from '../../lib/onboarding.js';
import { createLoan, deleteLoan, listLoans, updateLoan } from '../../lib/api.js';

const LOAN_TYPE_OPTIONS = ['HOME', 'CAR', 'PERSONAL', 'EDUCATION', 'CREDIT_CARD', 'OTHER'];

const Loans = ({ saveAndAdvance, goBack }) => {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const idRef = useRef(2);
  const [loans, setLoans] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listLoans()
      .then((items) => {
        if (cancelled || !Array.isArray(items)) return;
        if (items.length > 0) {
          setLoans(items.map((l) => ({
            id: `srv-${l.loan_id}`,
            server_id: l.loan_id,
            loan_type: l.loan_type,
            name: l.name ?? '',
            principal: paiseToRupees(l.principal_paise),
            outstanding: paiseToRupees(l.outstanding_paise),
            annual_rate: l.annual_rate === null || l.annual_rate === undefined ? '' : String(fractionToPercent(l.annual_rate)),
            tenure_months: l.tenure_months === null || l.tenure_months === undefined ? '' : String(l.tenure_months),
            start_date: l.start_date ?? '',
            rate_type: l.rate_type ?? 'FIXED',
          })));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function addLoanRow() {
    const id = `loan-${idRef.current}`;
    idRef.current += 1;
    setLoans((prev) => [...prev, {
      id, loan_type: 'HOME', name: '', principal: '', outstanding: '',
      annual_rate: '', tenure_months: '', start_date: '', rate_type: 'FIXED', server_id: null,
    }]);
  }

  function editLoan(id, field, value) {
    setLoans((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  async function removeLoanRow(id) {
    const row = loans.find((l) => l.id === id);
    if (row?.server_id) {
      try {
        await deleteLoan(row.server_id);
      } catch (err) {
        setFormError(err?.message || 'Could not delete loan');
        return;
      }
    }
    setLoans((prev) => prev.filter((l) => l.id !== id));
  }

  async function continueFromStep5(skipped = false) {
    if (skipped && loans.length === 0) {
      setSaving(true);
      setFormError('');
      try {
        await saveAndAdvance(6, {});
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
    for (const l of loans) {
      if (loanRowSync(l) === 'skip') continue;
      if (!l.name.trim()) next[`loan_${l.id}_name`] = 'Name is required';
      const pr = parseRupeesField('Principal', l.principal);
      if (pr.error) next[`loan_${l.id}_principal`] = pr.error;
      const out = parseRupeesField('Outstanding', l.outstanding);
      if (out.error) next[`loan_${l.id}_outstanding`] = out.error;
      const rate = Number(l.annual_rate);
      if (l.annual_rate.trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 36) {
        next[`loan_${l.id}_rate`] = 'Annual rate must be 0–36%';
      }
      const tenure = Number(l.tenure_months);
      if (!Number.isInteger(tenure) || tenure < 1 || tenure > 480) {
        next[`loan_${l.id}_tenure`] = 'Tenure must be 1–480 months';
      }
      if (!l.start_date) next[`loan_${l.id}_start`] = 'Start date is required';
      if (!next[`loan_${l.id}_name`] && !next[`loan_${l.id}_principal`] && !next[`loan_${l.id}_outstanding`] && !next[`loan_${l.id}_rate`] && !next[`loan_${l.id}_tenure`] && !next[`loan_${l.id}_start`]) {
        toSave.push({ row: l, principal: pr.paise, outstanding: out.paise, rate: percentToFraction(rate), tenure });
      }
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      for (const { row, principal, outstanding, rate, tenure } of toSave) {
        const payload = buildLoanPayload({
          loanType: row.loan_type,
          name: row.name.trim(),
          principalPaise: principal,
          outstandingPaise: outstanding,
          annualRate: rate,
          tenureMonths: tenure,
          startDate: row.start_date,
          rateType: row.rate_type,
        });
        if (row.server_id) {
          await updateLoan(row.server_id, payload);
        } else {
          const created = await createLoan(payload);
          const newId = serverIdOf(created, null);
          setLoans((prev) => prev.map((x) => (x.id === row.id ? { ...x, server_id: newId } : x)));
        }
      }
      await saveAndAdvance(6, {});
      setErrors({});
    } catch (err) {
      setFormError(err?.message || 'Could not save loans');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {formError && <div style={{ color: 'var(--error-color)', marginBottom: '1rem', fontSize: '0.875rem' }}>{formError}</div>}
      <p style={{ color: 'var(--text-secondary)' }}>Loans are optional. Add each loan or skip.</p>
      {loans.map((l) => (
        <div key={l.id} style={{ border: '1px solid var(--border-color)', padding: '1rem', marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Loan type</label>
            <select value={l.loan_type} onChange={(e) => editLoan(l.id, 'loan_type', e.target.value)} style={inputStyle}>
              {LOAN_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{LOAN_TYPE_LABELS[o] ?? o}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Rate type</label>
            <select value={l.rate_type} onChange={(e) => editLoan(l.id, 'rate_type', e.target.value)} style={inputStyle}>
              <option value="FIXED">{RATE_TYPE_LABELS.FIXED}</option>
              <option value="FLOATING">{RATE_TYPE_LABELS.FLOATING}</option>
            </select>
          </div>
          <div>
            <Input label="Name" id={`loan-name-${l.id}`} value={l.name} onChange={(e) => editLoan(l.id, 'name', e.target.value)} placeholder="Home loan" />
            {errors[`loan_${l.id}_name`] && <div style={errStyle}>{errors[`loan_${l.id}_name`]}</div>}
          </div>
          <div>
            <Input label="Start date" id={`loan-start-${l.id}`} type="date" value={l.start_date} onChange={(e) => editLoan(l.id, 'start_date', e.target.value)} />
            {errors[`loan_${l.id}_start`] && <div style={errStyle}>{errors[`loan_${l.id}_start`]}</div>}
          </div>
          <div>
            <Input label="Principal (₹)" id={`loan-pr-${l.id}`} value={l.principal} onChange={(e) => editLoan(l.id, 'principal', e.target.value)} placeholder="5000000" />
            {errors[`loan_${l.id}_principal`] && <div style={errStyle}>{errors[`loan_${l.id}_principal`]}</div>}
          </div>
          <div>
            <Input label="Outstanding (₹)" id={`loan-out-${l.id}`} value={l.outstanding} onChange={(e) => editLoan(l.id, 'outstanding', e.target.value)} placeholder="4200000" />
            {errors[`loan_${l.id}_outstanding`] && <div style={errStyle}>{errors[`loan_${l.id}_outstanding`]}</div>}
          </div>
          <div>
            <Input label="Annual rate %" id={`loan-rate-${l.id}`} value={l.annual_rate} onChange={(e) => editLoan(l.id, 'annual_rate', e.target.value)} placeholder="8.5" />
            {errors[`loan_${l.id}_rate`] && <div style={errStyle}>{errors[`loan_${l.id}_rate`]}</div>}
            {Number(l.annual_rate) > 24 && Number(l.annual_rate) <= 36 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--error-color)' }}>Rate above 24% is unusually high — still allowed.</div>
            )}
          </div>
          <div>
            <Input label="Tenure (months)" id={`loan-tenure-${l.id}`} value={l.tenure_months} onChange={(e) => editLoan(l.id, 'tenure_months', e.target.value)} placeholder="240" />
            {errors[`loan_${l.id}_tenure`] && <div style={errStyle}>{errors[`loan_${l.id}_tenure`]}</div>}
          </div>
          <div>
            <button type="button" onClick={() => removeLoanRow(l.id)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>Remove loan</button>
          </div>
        </div>
      ))}
      <div style={{ marginTop: '1rem' }}>
        <Button variant="outline" onClick={addLoanRow}>+ Add a loan</Button>
      </div>
      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outline" onClick={goBack}>Back</Button>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Button variant="outline" onClick={() => continueFromStep5(true)} disabled={saving}>Skip</Button>
          <Button onClick={() => continueFromStep5(false)} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
        </div>
      </div>
    </div>
  );
};

export default Loans;
