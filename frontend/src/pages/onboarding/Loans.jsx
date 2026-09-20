import React, { useEffect, useRef, useState } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { errStyle, inputStyle } from '../../components/onboarding/styles.js';
import {
  buildLoanPayload, fractionToPercent, loanRowSync, LOAN_TYPE_LABELS, paiseToRupees, parseRupeesField, percentToFraction, RATE_TYPE_LABELS, serverIdOf, validateCardFields,
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
            issuer: l.issuer ?? '',
            credit_limit: paiseToRupees(l.credit_limit_paise),
            payment_due_day: l.payment_due_day === null || l.payment_due_day === undefined ? '' : String(l.payment_due_day),
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
      issuer: '', credit_limit: '', payment_due_day: '',
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
      const cardErrors = validateCardFields({
        loanType: l.loan_type,
        issuer: l.issuer,
        creditLimit: l.credit_limit,
        paymentDueDay: l.payment_due_day,
      });
      let cardLimitPaise;
      let cardDueDay;
      if (l.loan_type === 'CREDIT_CARD') {
        if (cardErrors.issuer) next[`loan_${l.id}_issuer`] = cardErrors.issuer;
        if (cardErrors.credit_limit) next[`loan_${l.id}_credit_limit`] = cardErrors.credit_limit;
        if (cardErrors.payment_due_day) next[`loan_${l.id}_payment_due_day`] = cardErrors.payment_due_day;
        if (String(l.credit_limit ?? '').trim() !== '' && !cardErrors.credit_limit) {
          const parsed = parseRupeesField('Credit limit', l.credit_limit);
          if (parsed.error) next[`loan_${l.id}_credit_limit`] = parsed.error;
          else cardLimitPaise = parsed.paise;
        }
        if (String(l.payment_due_day ?? '').trim() !== '' && !cardErrors.payment_due_day) {
          cardDueDay = Number(String(l.payment_due_day).trim());
        }
      }
      if (!next[`loan_${l.id}_name`] && !next[`loan_${l.id}_principal`] && !next[`loan_${l.id}_outstanding`] && !next[`loan_${l.id}_rate`] && !next[`loan_${l.id}_tenure`] && !next[`loan_${l.id}_start`] && !next[`loan_${l.id}_issuer`] && !next[`loan_${l.id}_credit_limit`] && !next[`loan_${l.id}_payment_due_day`]) {
        toSave.push({ row: l, principal: pr.paise, outstanding: out.paise, rate: percentToFraction(rate), tenure, cardLimitPaise, cardDueDay });
      }
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      for (const { row, principal, outstanding, rate, tenure, cardLimitPaise, cardDueDay } of toSave) {
        const issuer = row.loan_type === 'CREDIT_CARD' ? String(row.issuer ?? '').trim() : undefined;
        const payload = buildLoanPayload({
          loanType: row.loan_type,
          name: row.name.trim(),
          principalPaise: principal,
          outstandingPaise: outstanding,
          annualRate: rate,
          tenureMonths: tenure,
          startDate: row.start_date,
          rateType: row.rate_type,
          issuer: row.loan_type === 'CREDIT_CARD' && issuer !== '' ? issuer : undefined,
          creditLimitPaise: row.loan_type === 'CREDIT_CARD' ? cardLimitPaise : undefined,
          paymentDueDay: row.loan_type === 'CREDIT_CARD' ? cardDueDay : undefined,
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
            {l.loan_type === 'CREDIT_CARD' && l.issuer && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Card: {l.issuer}{l.credit_limit ? ` · limit ₹${l.credit_limit}` : ''}{l.payment_due_day ? ` · due day ${l.payment_due_day}` : ''}
              </div>
            )}
          </div>
          {l.loan_type === 'CREDIT_CARD' && (
            <>
              <div>
                <Input label="Card issuer (optional)" id={`loan-issuer-${l.id}`} value={l.issuer ?? ''} onChange={(e) => editLoan(l.id, 'issuer', e.target.value)} placeholder="HDFC Regalia" />
                {errors[`loan_${l.id}_issuer`] && <div style={errStyle}>{errors[`loan_${l.id}_issuer`]}</div>}
              </div>
              <div>
                <Input label="Credit limit ₹ (optional)" id={`loan-limit-${l.id}`} value={l.credit_limit ?? ''} onChange={(e) => editLoan(l.id, 'credit_limit', e.target.value)} placeholder="300000" />
                {errors[`loan_${l.id}_credit_limit`] && <div style={errStyle}>{errors[`loan_${l.id}_credit_limit`]}</div>}
              </div>
              <div>
                <Input label="Due day 1–31 (optional)" id={`loan-due-${l.id}`} value={l.payment_due_day ?? ''} onChange={(e) => editLoan(l.id, 'payment_due_day', e.target.value)} placeholder="5" />
                {errors[`loan_${l.id}_payment_due_day`] && <div style={errStyle}>{errors[`loan_${l.id}_payment_due_day`]}</div>}
              </div>
            </>
          )}
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
