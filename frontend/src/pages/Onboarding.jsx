import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import {
  createGoal, createHolding, createLoan, createStatementJob,
  deleteGoal, deleteHolding, deleteLoan,
  getMe, listGoals, listHoldings, listLoans,
  updateGoal, updateHolding, updateLoan, updateProfile,
} from '../lib/api.js';
import { rupeesToPaise } from '../lib/money.js';
import {
  ASSET_TYPE_LABELS, buildFdPayload, buildGoalPayload, buildHoldingPayload, buildLoanPayload,
  fdHoldingSync, fractionToPercent, goalDefaultName, goalRowSync, holdingRowSync, loanRowSync,
  LOAN_TYPE_LABELS, percentToFraction, paiseToRupees, RATE_TYPE_LABELS,
  RISK_PROFILE_LABELS, STRATEGY_GOAL_LABELS, GOAL_TYPE_LABELS,
} from '../lib/onboarding.js';
import { RISK_QUESTIONS, explainRiskSuggestion, scoreRiskAnswers, suggestRiskProfile } from '../lib/risk.js';

const STEP_TITLES = ['Consent', 'About you', 'Monthly money', 'What you have', 'Loans', 'Risk & strategy', 'Goals', 'Finish'];

const ASSET_OPTIONS = [
  { value: 'STOCK', label: ASSET_TYPE_LABELS.STOCK },
  { value: 'ETF', label: ASSET_TYPE_LABELS.ETF },
  { value: 'MUTUAL_FUND', label: ASSET_TYPE_LABELS.MUTUAL_FUND },
  { value: 'CRYPTO', label: ASSET_TYPE_LABELS.CRYPTO },
  { value: 'OTHER', label: ASSET_TYPE_LABELS.OTHER },
];

const LOAN_TYPE_OPTIONS = ['HOME', 'CAR', 'PERSONAL', 'EDUCATION', 'CREDIT_CARD', 'OTHER'];
const STRATEGY_GOAL_OPTIONS = ['WEALTH_GROWTH', 'INCOME', 'CAPITAL_PRESERVATION', 'FIRE'];
const GOAL_TYPE_OPTIONS = ['CAR', 'WEDDING', 'HOUSE_DOWN_PAYMENT', 'EDUCATION', 'TRAVEL', 'OTHER'];

const MAX_PAISE = 10000000000;

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function parseRupeesField(label, value, { required = true, maxPaise = MAX_PAISE } = {}) {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') {
    if (!required) return { paise: 0, empty: true };
    return { error: `${label} is required` };
  }
  let paise;
  try {
    paise = rupeesToPaise(trimmed);
  } catch {
    return { error: `${label} must be a valid amount with up to 2 decimals` };
  }
  if (paise < 0 || paise > maxPaise) {
    return { error: `${label} must be between ₹0 and ₹10 crore` };
  }
  return { paise };
}

function serverIdOf(created, fallback) {
  return created?.holding_id ?? created?.loan_id ?? created?.goal_id ?? created?.id ?? fallback;
}

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [statementMsg, setStatementMsg] = useState('');
  const idRef = useRef(2);
  // Tracks which steps already hydrated from the server this session, so
  // Back/Continue navigation never refetches (and never re-creates).
  const hydratedRef = useRef({ holdings: false, loans: false, goals: false });

  const [consent, setConsent] = useState(false);
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');

  const [incomes, setIncomes] = useState({ job: '', business: '', rental: '', dividend: '', freelance: '' });
  const [cashParts, setCashParts] = useState({ current: '', savings: '', cash: '' });
  const [monthlyInvestment, setMonthlyInvestment] = useState('');
  const [expenses, setExpenses] = useState({
    rent: '', food: '', transportation: '', utilities: '', insurance: '',
    subscriptions: '', shopping: '', healthcare: '', education: '', entertainment: '', miscellaneous: '',
  });

  const [holdings, setHoldings] = useState([
    { id: 'holding-1', asset_type: 'STOCK', symbol: '', name: '', quantity: '', buyPrice: '', server_id: null },
  ]);
  const [fdAmount, setFdAmount] = useState('');
  const [fdServerId, setFdServerId] = useState(null);
  const [emergencyMonths, setEmergencyMonths] = useState('6');

  const [loans, setLoans] = useState([]);
  const [riskAnswers, setRiskAnswers] = useState([null, null, null, null]);
  const [riskOverride, setRiskOverride] = useState('');
  const [horizonYears, setHorizonYears] = useState('');
  const [strategyGoal, setStrategyGoal] = useState('WEALTH_GROWTH');
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    let mounted = true;
    getMe()
      .then((profile) => {
        if (!mounted) return;
        if (profile?.onboarded) {
          navigate('/dashboard', { replace: true });
          return;
        }
        if (profile) {
          if (profile.name) setName(profile.name);
          if (profile.date_of_birth) setDob(profile.date_of_birth);
          if (typeof profile.onboarding_step === 'number' && profile.onboarding_step >= 1 && profile.onboarding_step <= 8) {
            setStep(profile.onboarding_step);
          }
          // Resume: prefill single-value fields from stored paise values.
          // Income/expense streams can't be reconstructed from totals, so
          // those stay blank (income is optional and sends null).
          if (profile.monthly_investment_paise !== null && profile.monthly_investment_paise !== undefined) {
            setMonthlyInvestment(paiseToRupees(profile.monthly_investment_paise));
          }
          if (profile.cash_balance_paise !== null && profile.cash_balance_paise !== undefined) {
            setCashParts((prev) => ({ ...prev, savings: paiseToRupees(profile.cash_balance_paise) }));
          }
          if (profile.emergency_fund_target_months !== null && profile.emergency_fund_target_months !== undefined) {
            setEmergencyMonths(String(profile.emergency_fund_target_months));
          }
          if (profile.investment_horizon_years !== null && profile.investment_horizon_years !== undefined) {
            setHorizonYears(String(profile.investment_horizon_years));
          }
          if (profile.strategy_goal) setStrategyGoal(profile.strategy_goal);
          if (Array.isArray(profile.risk_answers) && profile.risk_answers.length === 4) {
            setRiskAnswers(profile.risk_answers);
          }
          if (profile.risk_profile) setRiskOverride(profile.risk_profile);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  // Hydrate steps 4/5/7 from the server (first visit per session, incl. resume
  // after reload) so saved rows show instead of empty forms.
  useEffect(() => {
    let cancelled = false;
    if (step === 4 && !hydratedRef.current.holdings) {
      listHoldings()
        .then((items) => {
          if (cancelled || !Array.isArray(items)) return;
          const fd = items.find((h) => h.asset_type === 'FD');
          if (fd) {
            setFdAmount(paiseToRupees(fd.fd_principal_paise));
            setFdServerId(fd.holding_id ?? null);
          }
          const rest = items.filter((h) => h.asset_type !== 'FD');
          if (rest.length > 0) {
            setHoldings(rest.map((h) => ({
              id: `srv-${h.holding_id}`,
              server_id: h.holding_id,
              asset_type: h.asset_type,
              symbol: h.symbol ?? '',
              name: h.name ?? '',
              quantity: h.quantity === null || h.quantity === undefined ? '' : String(h.quantity),
              buyPrice: paiseToRupees(h.avg_buy_price_paise),
            })));
          }
          hydratedRef.current.holdings = true;
        })
        .catch(() => {});
    }
    if (step === 5 && !hydratedRef.current.loans) {
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
          hydratedRef.current.loans = true;
        })
        .catch(() => {});
    }
    if (step === 7 && !hydratedRef.current.goals) {
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
          hydratedRef.current.goals = true;
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [step]);

  async function saveStep(nextStep, extraProfile = {}) {
    setSaving(true);
    setFormError('');
    try {
      await updateProfile({ onboarding_step: nextStep, ...extraProfile });
      setStep(nextStep);
      setErrors({});
    } catch (err) {
      setFormError(err?.message || 'Could not save progress');
    } finally {
      setSaving(false);
    }
  }

  function setIncomeField(id, value) {
    setIncomes((prev) => ({ ...prev, [id]: value }));
  }
  function setExpenseField(id, value) {
    setExpenses((prev) => ({ ...prev, [id]: value }));
  }
  function setCashField(id, value) {
    setCashParts((prev) => ({ ...prev, [id]: value }));
  }

  function addHoldingRow() {
    const id = `holding-${idRef.current}`;
    idRef.current += 1;
    setHoldings((prev) => [...prev, { id, asset_type: 'STOCK', symbol: '', name: '', quantity: '', buyPrice: '', server_id: null }]);
  }

  function editHolding(id, field, value) {
    setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  }

  async function removeHoldingRow(id) {
    const row = holdings.find((h) => h.id === id);
    if (row?.server_id) {
      try {
        await deleteHolding(row.server_id);
      } catch (err) {
        setFormError(err?.message || 'Could not delete holding');
        return;
      }
    }
    setHoldings((prev) => {
      const next = prev.filter((h) => h.id !== id);
      if (next.length === 0) {
        const fresh = `holding-${idRef.current}`;
        idRef.current += 1;
        return [{ id: fresh, asset_type: 'STOCK', symbol: '', name: '', quantity: '', buyPrice: '', server_id: null }];
      }
      return next;
    });
  }

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

  async function handleStatementAutofill() {
    setStatementMsg('');
    try {
      await createStatementJob({});
      setStatementMsg("Statement import isn't available yet — enter the numbers manually");
    } catch {
      setStatementMsg("Statement import isn't available yet — enter the numbers manually");
    }
  }

  async function continueFromStep1() {
    if (!consent) {
      setErrors({ consent: 'Please accept the consent to continue' });
      return;
    }
    await saveStep(2, { consent_accepted_at: new Date().toISOString() });
  }

  async function continueFromStep2() {
    const next = {};
    if (!name.trim()) next.name = 'Name is required';
    const age = ageFromDob(dob);
    if (age === null) next.dob = 'Enter a valid date of birth (YYYY-MM-DD)';
    else if (age < 18 || age > 80) next.dob = 'Age must be between 18 and 80';
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    await saveStep(3, { name: name.trim(), date_of_birth: dob });
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
    await saveStep(4, {
      monthly_income_paise: incomeEntered ? incomePaise : null,
      monthly_expenses_paise: expensePaise,
      monthly_investment_paise: inv.paise ?? 0,
      cash_balance_paise: cashPaise,
    });
  }

  async function continueFromStep4() {
    const next = {};
    const toSave = [];
    for (let i = 0; i < holdings.length; i += 1) {
      const h = holdings[i];
      if (holdingRowSync(h) === 'skip') continue;
      if (!h.symbol.trim()) next[`holding_${h.id}_symbol`] = 'Symbol is required (NSE symbol like RELIANCE)';
      else if (/\.ns$/i.test(h.symbol.trim())) next[`holding_${h.id}_symbol`] = 'Use NSE symbol without .NS';
      const qty = Number(h.quantity);
      if (h.quantity.trim() === '' || !Number.isFinite(qty) || qty <= 0) next[`holding_${h.id}_qty`] = 'Quantity must be positive';
      const bp = parseRupeesField('Average buy price', h.buyPrice);
      if (bp.error) next[`holding_${h.id}_price`] = bp.error;
      if (!next[`holding_${h.id}_symbol`] && !next[`holding_${h.id}_qty`] && !next[`holding_${h.id}_price`]) {
        toSave.push({ row: h, qty, paise: bp.paise });
      }
    }
    const fd = fdAmount.trim() === '' ? { paise: 0, empty: true } : parseRupeesField('Fixed deposits', fdAmount);
    if (fd.error) next.fdAmount = fd.error;
    const em = Number(emergencyMonths);
    if (!Number.isInteger(em) || em < 0 || em > 24) next.emergencyMonths = 'Enter 0–24 months';
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      for (const { row, qty, paise } of toSave) {
        const payload = buildHoldingPayload({
          assetType: row.asset_type,
          symbol: row.symbol.trim().toUpperCase(),
          name: row.name.trim() || row.symbol.trim().toUpperCase(),
          quantity: qty,
          avgBuyPricePaise: paise,
        });
        if (row.server_id) {
          await updateHolding(row.server_id, payload);
        } else {
          // Store the server id immediately so a retry updates instead of
          // creating a duplicate.
          const created = await createHolding(payload);
          const newId = serverIdOf(created, null);
          setHoldings((prev) => prev.map((x) => (x.id === row.id ? { ...x, server_id: newId } : x)));
        }
      }
      const fdAction = fdHoldingSync({ serverId: fdServerId, paise: fd.paise ?? 0 });
      if (fdAction === 'create') {
        const created = await createHolding(buildFdPayload(fd.paise));
        setFdServerId(serverIdOf(created, null));
      } else if (fdAction === 'update') {
        await updateHolding(fdServerId, buildFdPayload(fd.paise));
      } else if (fdAction === 'delete') {
        await deleteHolding(fdServerId);
        setFdServerId(null);
      }
      hydratedRef.current.holdings = true;
      await updateProfile({ onboarding_step: 5, emergency_fund_target_months: em });
      setStep(5);
      setErrors({});
    } catch (err) {
      setFormError(err?.message || 'Could not save holdings');
    } finally {
      setSaving(false);
    }
  }

  async function continueFromStep5(skipped = false) {
    if (skipped && loans.length === 0) {
      await saveStep(6, {});
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
      hydratedRef.current.loans = true;
      await updateProfile({ onboarding_step: 6 });
      setStep(6);
      setErrors({});
    } catch (err) {
      setFormError(err?.message || 'Could not save loans');
    } finally {
      setSaving(false);
    }
  }

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
    await saveStep(7, {
      risk_score: score,
      risk_answers: riskAnswers,
      risk_profile: finalProfile,
      investment_horizon_years: hy,
      strategy_goal: strategyGoal,
    });
  }

  async function continueFromStep7(skipped = false) {
    const age = ageFromDob(dob);
    if (skipped && goals.length === 0) {
      await saveStep(8, {});
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
      hydratedRef.current.goals = true;
      await updateProfile({ onboarding_step: 8 });
      setStep(8);
      setErrors({});
    } catch (err) {
      setFormError(err?.message || 'Could not save goals');
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    setFormError('');
    try {
      await updateProfile({ onboarded: true, onboarding_step: 8 });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setFormError(err?.message || 'Could not finish onboarding');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading…</p>;

  const inputStyle = {
    width: '100%', padding: '0.5rem', background: 'transparent',
    border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none',
    fontSize: '0.875rem',
  };
  const errStyle = { color: 'var(--error-color)', fontSize: '0.8rem', marginTop: '0.25rem' };

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

      {formError && <div style={{ color: 'var(--error-color)', marginBottom: '1rem', fontSize: '0.875rem' }}>{formError}</div>}

      {step === 1 && (
        <div>
          <ul style={{ lineHeight: 1.8, color: 'var(--text-secondary)' }}>
            <li>This is an educational tool, not SEBI-regulated investment advice.</li>
            <li>Your data may be processed by Bedrock models outside India.</li>
            <li>Uploaded statements are AI-read and you review them before anything is saved.</li>
          </ul>
          <label style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I understand and accept</span>
          </label>
          {errors.consent && <div style={errStyle}>{errors.consent}</div>}
          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={continueFromStep1} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <Input label="Full name" id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          {errors.name && <div style={errStyle}>{errors.name}</div>}
          <Input label="Date of birth (YYYY-MM-DD)" id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          {errors.dob && <div style={errStyle}>{errors.dob}</div>}
          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={continueFromStep2} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ border: '1px solid var(--border-color)', padding: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>Auto-fill from a bank statement (optional)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Try importing a statement to fill these numbers.</p>
            <Button variant="outline" onClick={handleStatementAutofill}>Auto-fill from statement</Button>
            {statementMsg && <div style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>{statementMsg}</div>}
          </div>

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
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={continueFromStep3} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Use NSE symbols like RELIANCE (no .NS suffix).</p>
          <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '0.75rem' }}>Asset Type</th>
                  <th style={{ padding: '0.75rem' }}>Symbol</th>
                  <th style={{ padding: '0.75rem' }}>Name</th>
                  <th style={{ padding: '0.75rem' }}>Quantity</th>
                  <th style={{ padding: '0.75rem' }}>Avg buy price (₹)</th>
                  <th style={{ padding: '0.75rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <select value={h.asset_type} onChange={(e) => editHolding(h.id, 'asset_type', e.target.value)} style={inputStyle}>
                        {ASSET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input value={h.symbol} onChange={(e) => editHolding(h.id, 'symbol', e.target.value)} placeholder="RELIANCE" style={inputStyle} />
                      {errors[`holding_${h.id}_symbol`] && <div style={errStyle}>{errors[`holding_${h.id}_symbol`]}</div>}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input value={h.name} onChange={(e) => editHolding(h.id, 'name', e.target.value)} placeholder="Reliance Industries" style={inputStyle} />
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input value={h.quantity} onChange={(e) => editHolding(h.id, 'quantity', e.target.value)} placeholder="10" style={inputStyle} />
                      {errors[`holding_${h.id}_qty`] && <div style={errStyle}>{errors[`holding_${h.id}_qty`]}</div>}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input value={h.buyPrice} onChange={(e) => editHolding(h.id, 'buyPrice', e.target.value)} placeholder="1500.25" style={inputStyle} />
                      {errors[`holding_${h.id}_price`] && <div style={errStyle}>{errors[`holding_${h.id}_price`]}</div>}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <button type="button" onClick={() => removeHoldingRow(h.id)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={addHoldingRow}>+ Add another holding</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
            <div>
              <Input label="Fixed deposits total (₹)" id="fdAmount" value={fdAmount} onChange={(e) => setFdAmount(e.target.value)} placeholder="e.g. 500000" />
              {errors.fdAmount && <div style={errStyle}>{errors.fdAmount}</div>}
            </div>
            <div>
              <Input label="Emergency fund target (months)" id="emergencyMonths" value={emergencyMonths} onChange={(e) => setEmergencyMonths(e.target.value)} placeholder="6" />
              {errors.emergencyMonths && <div style={errStyle}>{errors.emergencyMonths}</div>}
            </div>
          </div>
          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
            <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
            <Button onClick={continueFromStep4} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div>
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
            <Button variant="outline" onClick={() => setStep(4)}>Back</Button>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Button variant="outline" onClick={() => continueFromStep5(true)} disabled={saving}>Skip</Button>
              <Button onClick={() => continueFromStep5(false)} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
            </div>
          </div>
        </div>
      )}

      {step === 6 && (
        <div>
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
            <Button variant="outline" onClick={() => setStep(5)}>Back</Button>
            <Button onClick={continueFromStep6} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
          </div>
        </div>
      )}

      {step === 7 && (
        <div>
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
            <Button variant="outline" onClick={() => setStep(6)}>Back</Button>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Button variant="outline" onClick={() => continueFromStep7(true)} disabled={saving}>Skip</Button>
              <Button onClick={() => continueFromStep7(false)} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
            </div>
          </div>
        </div>
      )}

      {step === 8 && (
        <div style={{ textAlign: 'center' }}>
          <h3>You&apos;re all set</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Finish onboarding to see your dashboard.</p>
          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
            <Button variant="outline" onClick={() => setStep(7)}>Back</Button>
            <Button onClick={finish} disabled={saving}>{saving ? 'Finishing…' : 'Finish'}</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
