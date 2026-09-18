import React, { useEffect, useState } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import StatementAutofillBox from '../../components/onboarding/StatementAutofillBox';
import { errStyle } from '../../components/onboarding/styles.js';
import { MAX_PAISE, parseRupeesField, paiseToRupees, STEP3_DRAFT_KEY, deserializeStep3Draft, serializeStep3Draft } from '../../lib/onboarding.js';

const MonthlyMoney = ({ profile, saveAndAdvance, goBack }) => {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [statementMsg, setStatementMsg] = useState('');
  const [step3Draft] = useState(() => {
    try {
      return deserializeStep3Draft(window.localStorage.getItem(STEP3_DRAFT_KEY));
    } catch {
      return null;
    }
  });
  const [incomes, setIncomes] = useState(() => step3Draft?.incomes ?? ({ job: '', business: '', rental: '', dividend: '', freelance: '' }));
  const [cashParts, setCashParts] = useState(() => step3Draft?.cashParts ?? ({
    current: '',
    savings: profile?.cash_balance_paise !== null && profile?.cash_balance_paise !== undefined ? paiseToRupees(profile.cash_balance_paise) : '',
    cash: '',
  }));
  const [monthlyInvestment, setMonthlyInvestment] = useState(() => (
    profile?.monthly_investment_paise !== null && profile?.monthly_investment_paise !== undefined
      ? paiseToRupees(profile.monthly_investment_paise) : ''
  ));
  const [expenses, setExpenses] = useState(() => step3Draft?.expenses ?? ({
    rent: '', food: '', transportation: '', utilities: '', insurance: '',
    subscriptions: '', shopping: '', healthcare: '', education: '', entertainment: '', miscellaneous: '',
  }));

  useEffect(() => {
    try {
      window.localStorage.setItem(STEP3_DRAFT_KEY, serializeStep3Draft({ incomes, expenses, cashParts }));
    } catch {}
  }, [incomes, expenses, cashParts]);

  function setIncomeField(id, value) {
    setIncomes((prev) => ({ ...prev, [id]: value }));
  }
  function setExpenseField(id, value) {
    setExpenses((prev) => ({ ...prev, [id]: value }));
  }
  function setCashField(id, value) {
    setCashParts((prev) => ({ ...prev, [id]: value }));
  }

  function handleStatementAutofill() {
    setStatementMsg("Statement import isn't available yet — enter the numbers manually");
  }

  async function continueFromStep3() {
    const next = {};
    let incomePaise = 0;
    let incomeEntered = false;
    for (const [key, label] of [['job', 'Job income'], ['business', 'Business income'], ['rental', 'Rental income'], ['dividend', 'Dividend income'], ['freelance', 'Freelance income']]) {
      const v = incomes[key].trim();
      if (v === '') continue;
      incomeEntered = true;
      const r = parseRupeesField(label, v);
      if (r.error) next[`income_${key}`] = r.error;
      else incomePaise += r.paise;
    }
    let expensePaise = 0;
    for (const [key, label] of Object.entries({
      rent: 'Rent', food: 'Food', transportation: 'Transportation', utilities: 'Utilities',
      insurance: 'Insurance', subscriptions: 'Subscriptions', shopping: 'Shopping',
      healthcare: 'Healthcare', education: 'Education', entertainment: 'Entertainment', miscellaneous: 'Miscellaneous',
    })) {
      const v = expenses[key].trim();
      if (v === '') continue;
      const r = parseRupeesField(label, v);
      if (r.error) next[`expense_${key}`] = r.error;
      else expensePaise += r.paise;
    }
    const inv = parseRupeesField('Monthly investment', monthlyInvestment || '0', { required: false });
    if (inv.error) next.monthlyInvestment = inv.error;
    let cashPaise = 0;
    for (const [key, label] of [['current', 'Current account'], ['savings', 'Savings account'], ['cash', 'Cash on hand']]) {
      const v = cashParts[key].trim();
      if (v === '') continue;
      const r = parseRupeesField(label, v);
      if (r.error) next[`cash_${key}`] = r.error;
      else cashPaise += r.paise;
    }
    if (incomeEntered && incomePaise > MAX_PAISE) next.income_total = 'Total income must be within ₹10 crore';
    if (expensePaise > MAX_PAISE) next.expense_total = 'Total expenses must be within ₹10 crore';
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await saveAndAdvance(4, {
        monthly_income_paise: incomeEntered ? incomePaise : null,
        monthly_expenses_paise: expensePaise,
        monthly_investment_paise: inv.paise ?? 0,
        cash_balance_paise: cashPaise,
      });
      setErrors({});
    } catch (err) {
      setFormError(err?.message || 'Could not save progress');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {formError && <div style={{ color: 'var(--error-color)', marginBottom: '1rem', fontSize: '0.875rem' }}>{formError}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <StatementAutofillBox
        heading="Auto-fill from a bank statement (optional)"
        helperText="Try importing a statement to fill these numbers."
        onClick={handleStatementAutofill}
        message={statementMsg}
      />

      <div>
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Income Streams (Monthly, ₹, optional)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          {[['job', 'Job / Salary'], ['business', 'Business'], ['rental', 'Rental'], ['dividend', 'Dividend'], ['freelance', 'Freelance']].map(([id, label]) => (
            <div key={id}>
              <Input label={label} id={id} value={incomes[id]} onChange={(e) => setIncomeField(id, e.target.value)} placeholder="e.g. 80000" />
              {errors[`income_${id}`] && <div style={errStyle}>{errors[`income_${id}`]}</div>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Monthly Living Expenses (₹, EMIs NOT included here)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          {Object.entries({
            rent: 'Rent', food: 'Food / Groceries', transportation: 'Transportation', utilities: 'Utilities',
            insurance: 'Insurance', subscriptions: 'Subscriptions', shopping: 'Shopping',
            healthcare: 'Healthcare', education: 'Education', entertainment: 'Entertainment', miscellaneous: 'Miscellaneous',
          }).map(([id, label]) => (
            <div key={id}>
              <Input label={label} id={`exp-${id}`} value={expenses[id]} onChange={(e) => setExpenseField(id, e.target.value)} placeholder="e.g. 12000" />
              {errors[`expense_${id}`] && <div style={errStyle}>{errors[`expense_${id}`]}</div>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Investment & Cash (₹)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <Input label="Monthly investment" id="monthlyInvestment" value={monthlyInvestment} onChange={(e) => setMonthlyInvestment(e.target.value)} placeholder="e.g. 20000" />
            {errors.monthlyInvestment && <div style={errStyle}>{errors.monthlyInvestment}</div>}
          </div>
          <div>
            <Input label="Current account balance" id="cash-current" value={cashParts.current} onChange={(e) => setCashField('current', e.target.value)} placeholder="e.g. 45000" />
            {errors.cash_current && <div style={errStyle}>{errors.cash_current}</div>}
          </div>
          <div>
            <Input label="Savings account balance" id="cash-savings" value={cashParts.savings} onChange={(e) => setCashField('savings', e.target.value)} placeholder="e.g. 200000" />
            {errors.cash_savings && <div style={errStyle}>{errors.cash_savings}</div>}
          </div>
          <div>
            <Input label="Cash on hand" id="cash-cash" value={cashParts.cash} onChange={(e) => setCashField('cash', e.target.value)} placeholder="e.g. 15000" />
            {errors.cash_cash && <div style={errStyle}>{errors.cash_cash}</div>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outline" onClick={goBack}>Back</Button>
        <Button onClick={continueFromStep3} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
      </div>
      </div>
    </>
  );
};

export default MonthlyMoney;
