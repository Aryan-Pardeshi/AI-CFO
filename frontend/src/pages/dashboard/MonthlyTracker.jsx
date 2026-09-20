import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getDashboardProfile, getCashflowSummary, saveDashboardFinancials } from '../../lib/dashboardApi.js';
import { listLoans, createLoan, updateLoan, deleteLoan } from '../../lib/api.js';
import { formatPaise } from '../../lib/money.js';
import {
  mapCashflowSummary,
  getMonthOptions,
  getDefaultMonth,
  selectMonthCashflow,
  formatCategoryBreakdown,
  summarizeLoanEmis,
} from '../../lib/cashflow.js';

// Monthly Tracker built on canonical current data only:
// - observed income/spending/category history from GET /cashflow/summary (committed
//   statement transactions only — nothing here is estimated or forecast)
// - EMI obligations read from GET /loans' server-computed monthly_emi_paise (the
//   locked reducing-balance formula lives once in backend-node/src/services/emi.js;
//   this page never re-implements it)
// - profile monthly income/expenses shown as explicitly labelled estimates, kept as
//   rupee-decimal display strings and never mixed into paise arithmetic
// There is no "mark paid" button: the API has no authenticated persistence model for
// bill-payment state, so that legacy interaction is omitted entirely rather than faked.

const cardStyle = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  padding: '1.25rem',
  minWidth: 0,
};

const cardLabelStyle = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
};

const cardValueStyle = {
  fontSize: '1.5rem',
  fontWeight: 600,
  fontFamily: 'var(--font-serif)',
  marginTop: '0.5rem',
  overflowWrap: 'break-word',
};

const provenanceStyle = {
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '0.2rem 0.55rem',
  border: '1px solid var(--border-color)',
  display: 'inline-block',
  width: 'fit-content',
};

const noticeStyle = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderLeft: '4px solid #B45309',
  padding: '0.85rem 1rem',
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
};

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(5px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
};

const modalDialogStyle = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  width: '100%',
  maxWidth: '640px',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
  overflow: 'hidden',
};

const inputGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
};

const inputLabelStyle = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

const modalInputStyle = {
  padding: '0.55rem 0.75rem',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  background: 'rgba(255, 255, 255, 0.04)',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
};

const rupeeFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

const StatCard = ({ label, value, testId }) => (
  <div style={cardStyle}>
    <div style={cardLabelStyle}>{label}</div>
    <div style={cardValueStyle} {...(testId ? { 'data-testid': testId } : {})}>{value}</div>
  </div>
);

// Estimates come from getDashboardProfile() as rupee-decimal STRINGS (never paise) —
// summed here purely for display, kept entirely separate from any paise arithmetic.
function sumProfileEstimate(map) {
  if (!map || typeof map !== 'object') return null;
  const values = Object.values(map)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0);
}

const INCOME_KEYS = [
  { key: 'jobSalary', label: 'Salary / Wages' },
  { key: 'business', label: 'Business Income' },
  { key: 'rental', label: 'Rental Income' },
  { key: 'dividend', label: 'Dividends & Investments' },
  { key: 'freelance', label: 'Freelance & Side Income' },
];

const EXPENSE_KEYS = [
  { key: 'rent', label: 'Rent / Housing' },
  { key: 'food', label: 'Food & Groceries' },
  { key: 'transportation', label: 'Transportation' },
  { key: 'utilities', label: 'Utilities & Bills' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'shopping', label: 'Shopping & Discretionary' },
  { key: 'healthcare', label: 'Healthcare & Medical' },
  { key: 'education', label: 'Education' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'miscellaneous', label: 'Miscellaneous' },
];

const LOAN_TYPES_LIST = [
  { value: 'HOME', label: 'Home Loan' },
  { value: 'CAR', label: 'Car / Vehicle Loan' },
  { value: 'PERSONAL', label: 'Personal Loan' },
  { value: 'EDUCATION', label: 'Education Loan' },
  { value: 'CREDIT_CARD', label: 'Credit Card Loan' },
  { value: 'OTHER', label: 'Other' },
];

const EstimatesModal = ({ isOpen, onClose, currentFinancials, onSaved }) => {
  const [incomes, setIncomes] = useState({});
  const [expenses, setExpenses] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const inc = currentFinancials?.incomes || {};
    const exp = currentFinancials?.monthlyExpenses || {};
    const initialIncomes = {};
    for (const item of INCOME_KEYS) {
      initialIncomes[item.key] = inc[item.key] !== undefined ? String(inc[item.key]) : '';
    }
    // Also include any custom keys not in the standard list
    for (const [k, v] of Object.entries(inc)) {
      if (!(k in initialIncomes)) initialIncomes[k] = String(v);
    }

    const initialExpenses = {};
    for (const item of EXPENSE_KEYS) {
      initialExpenses[item.key] = exp[item.key] !== undefined ? String(exp[item.key]) : '';
    }
    for (const [k, v] of Object.entries(exp)) {
      if (!(k in initialExpenses)) initialExpenses[k] = String(v);
    }

    setIncomes(initialIncomes);
    setExpenses(initialExpenses);
    setError('');
    setSaving(false);
  }, [isOpen, currentFinancials]);

  if (!isOpen) return null;

  const totalInc = Object.values(incomes).reduce((sum, v) => {
    const n = parseFloat(v);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  const totalExp = Object.values(expenses).reduce((sum, v) => {
    const n = parseFloat(v);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  const netSavings = totalInc - totalExp;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      // Sanitize values to valid rupee strings
      const sanitizedIncomes = {};
      for (const [k, v] of Object.entries(incomes)) {
        const str = String(v).trim();
        if (str !== '') {
          const num = parseFloat(str);
          if (!Number.isFinite(num) || num < 0) {
            throw new Error(`Income "${k}" must be a valid non-negative number`);
          }
          sanitizedIncomes[k] = num.toFixed(2);
        }
      }

      const sanitizedExpenses = {};
      for (const [k, v] of Object.entries(expenses)) {
        const str = String(v).trim();
        if (str !== '') {
          const num = parseFloat(str);
          if (!Number.isFinite(num) || num < 0) {
            throw new Error(`Expense "${k}" must be a valid non-negative number`);
          }
          sanitizedExpenses[k] = num.toFixed(2);
        }
      }

      const base = currentFinancials || {};
      const updatedFinancials = {
        ...base,
        onboardingMethod: base.onboardingMethod || 'manual_advanced',
        incomes: sanitizedIncomes,
        liquidAssets: base.liquidAssets || {},
        portfolio: base.portfolio || [],
        preferences: base.preferences || { industries: [], instruments: [] },
        liabilities: base.liabilities || {},
        monthlyExpenses: sanitizedExpenses,
      };

      await saveDashboardFinancials(updatedFinancials);
      onSaved(updatedFinancials);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save monthly estimates. Please check your inputs.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlayStyle} role="dialog" aria-modal="true" aria-labelledby="estimates-modal-title" data-testid="estimates-modal">
      <div style={modalDialogStyle}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 id="estimates-modal-title" style={{ margin: 0, fontSize: '1.2rem' }}>Edit Monthly Estimates</h2>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Update your recurring monthly income streams and living expenses.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.25rem', cursor: 'pointer', padding: '0.25rem' }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
          <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
            {error && (
              <div role="alert" style={{ ...noticeStyle, borderLeftColor: 'var(--error-color, #EF4444)', color: 'var(--error-color, #EF4444)' }}>
                {error}
              </div>
            )}

            <div>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.75rem 0', fontWeight: 600, color: 'var(--accent-color)' }}>
                Monthly Incomes (₹)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {INCOME_KEYS.map(({ key, label }) => (
                  <div key={key} style={inputGroupStyle}>
                    <label htmlFor={`income-${key}`} style={inputLabelStyle}>{label}</label>
                    <input
                      id={`income-${key}`}
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={incomes[key] || ''}
                      onChange={(e) => setIncomes({ ...incomes, [key]: e.target.value })}
                      style={modalInputStyle}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.75rem 0', fontWeight: 600, color: 'var(--accent-color)' }}>
                Monthly Expenses (₹)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {EXPENSE_KEYS.map(({ key, label }) => (
                  <div key={key} style={inputGroupStyle}>
                    <label htmlFor={`expense-${key}`} style={inputLabelStyle}>{label}</label>
                    <input
                      id={`expense-${key}`}
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={expenses[key] || ''}
                      onChange={(e) => setExpenses({ ...expenses, [key]: e.target.value })}
                      style={modalInputStyle}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...cardStyle, background: 'rgba(255, 255, 255, 0.02)', padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Income</span>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{rupeeFormatter.format(totalInc)}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Expenses</span>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{rupeeFormatter.format(totalExp)}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Net Monthly Savings</span>
                <div style={{ fontWeight: 600, fontSize: '1rem', color: netSavings >= 0 ? '#10B981' : '#EF4444' }}>
                  {rupeeFormatter.format(netSavings)}
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: 'var(--surface-color)' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-outline"
              data-testid="cancel-estimates-btn"
              style={{ padding: '0.55rem 1.25rem', fontSize: '0.875rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn"
              data-testid="save-estimates-btn"
              style={{ padding: '0.55rem 1.5rem', fontSize: '0.875rem' }}
            >
              {saving ? 'Saving…' : 'Save Estimates'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const LoanModal = ({ isOpen, onClose, loanToEdit, onSaved }) => {
  const [name, setName] = useState('');
  const [loanType, setLoanType] = useState('HOME');
  const [principalRupees, setPrincipalRupees] = useState('');
  const [interestRatePct, setInterestRatePct] = useState('');
  const [tenureMonths, setTenureMonths] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (loanToEdit) {
      setName(loanToEdit.name || '');
      setLoanType(loanToEdit.loan_type || 'HOME');
      setPrincipalRupees(
        loanToEdit.principal_paise !== undefined && loanToEdit.principal_paise !== null
          ? (loanToEdit.principal_paise / 100).toString()
          : loanToEdit.outstanding_paise !== undefined && loanToEdit.outstanding_paise !== null
            ? (loanToEdit.outstanding_paise / 100).toString()
            : ''
      );
      setInterestRatePct(
        loanToEdit.annual_rate !== undefined && loanToEdit.annual_rate !== null
          ? (loanToEdit.annual_rate * 100).toFixed(2).replace(/\.00$/, '')
          : ''
      );
      setTenureMonths(loanToEdit.tenure_months ? loanToEdit.tenure_months.toString() : '');
    } else {
      setName('');
      setLoanType('HOME');
      setPrincipalRupees('');
      setInterestRatePct('8.5');
      setTenureMonths('240');
    }
    setError('');
    setSaving(false);
  }, [isOpen, loanToEdit]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Please enter a loan name.');

      const payload = {
        name: trimmedName,
        loan_type: loanType,
      };

      if (!loanToEdit) {
        // Creating a new loan requires all fields
        const principalNum = parseFloat(principalRupees);
        if (!Number.isFinite(principalNum) || principalNum <= 0) {
          throw new Error('Principal amount must be a positive number.');
        }
        payload.principal_paise = Math.round(principalNum * 100);
        payload.outstanding_paise = Math.round(principalNum * 100);

        const rateNum = parseFloat(interestRatePct);
        if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 36) {
          throw new Error('Annual interest rate must be between 0% and 36%.');
        }
        payload.annual_rate = rateNum / 100;

        const tenureNum = parseInt(tenureMonths, 10);
        if (!Number.isSafeInteger(tenureNum) || tenureNum < 1 || tenureNum > 480) {
          throw new Error('Tenure must be between 1 and 480 months.');
        }
        payload.tenure_months = tenureNum;
      } else {
        // Editing: add fields if provided
        if (principalRupees !== '') {
          const principalNum = parseFloat(principalRupees);
          if (!Number.isFinite(principalNum) || principalNum <= 0) {
            throw new Error('Principal amount must be a positive number.');
          }
          payload.principal_paise = Math.round(principalNum * 100);
          payload.outstanding_paise = Math.round(principalNum * 100);
        }

        if (interestRatePct !== '') {
          const rateNum = parseFloat(interestRatePct);
          if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 36) {
            throw new Error('Annual interest rate must be between 0% and 36%.');
          }
          payload.annual_rate = rateNum / 100;
        }

        if (tenureMonths !== '') {
          const tenureNum = parseInt(tenureMonths, 10);
          if (!Number.isSafeInteger(tenureNum) || tenureNum < 1 || tenureNum > 480) {
            throw new Error('Tenure must be between 1 and 480 months.');
          }
          payload.tenure_months = tenureNum;
        }
      }

      if (loanToEdit && loanToEdit.loan_id) {
        await updateLoan(loanToEdit.loan_id, payload);
      } else {
        await createLoan(payload);
      }

      await onSaved();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save loan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlayStyle} role="dialog" aria-modal="true" aria-labelledby="loan-modal-title" data-testid="loan-modal">
      <div style={{ ...modalDialogStyle, maxWidth: '520px' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 id="loan-modal-title" style={{ margin: 0, fontSize: '1.2rem' }}>
              {loanToEdit ? 'Edit Loan' : 'Add Loan'}
            </h2>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Enter loan details to calculate your monthly EMI obligations accurately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.25rem', cursor: 'pointer', padding: '0.25rem' }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && (
              <div role="alert" style={{ ...noticeStyle, borderLeftColor: 'var(--error-color, #EF4444)', color: 'var(--error-color, #EF4444)' }}>
                {error}
              </div>
            )}

            <div style={inputGroupStyle}>
              <label htmlFor="loan-name-input" style={inputLabelStyle}>Loan Name</label>
              <input
                id="loan-name-input"
                type="text"
                placeholder="e.g. HDFC Home Loan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={modalInputStyle}
              />
            </div>

            <div style={inputGroupStyle}>
              <label htmlFor="loan-type-select" style={inputLabelStyle}>Loan Type</label>
              <select
                id="loan-type-select"
                value={loanType}
                onChange={(e) => setLoanType(e.target.value)}
                style={{ ...modalInputStyle, background: 'var(--surface-color)' }}
              >
                {LOAN_TYPES_LIST.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div style={inputGroupStyle}>
              <label htmlFor="loan-principal-input" style={inputLabelStyle}>Principal / Outstanding (₹)</label>
              <input
                id="loan-principal-input"
                type="number"
                step="any"
                min="1"
                placeholder="e.g. 2500000"
                value={principalRupees}
                onChange={(e) => setPrincipalRupees(e.target.value)}
                {...(!loanToEdit ? { required: true } : {})}
                style={modalInputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={inputGroupStyle}>
                <label htmlFor="loan-rate-input" style={inputLabelStyle}>Annual Rate (%)</label>
                <input
                  id="loan-rate-input"
                  type="number"
                  step="0.01"
                  min="0"
                  max="36"
                  placeholder="e.g. 8.5"
                  value={interestRatePct}
                  onChange={(e) => setInterestRatePct(e.target.value)}
                  {...(!loanToEdit ? { required: true } : {})}
                  style={modalInputStyle}
                />
              </div>

              <div style={inputGroupStyle}>
                <label htmlFor="loan-tenure-input" style={inputLabelStyle}>Tenure (Months)</label>
                <input
                  id="loan-tenure-input"
                  type="number"
                  min="1"
                  max="480"
                  placeholder="e.g. 240"
                  value={tenureMonths}
                  onChange={(e) => setTenureMonths(e.target.value)}
                  {...(!loanToEdit ? { required: true } : {})}
                  style={modalInputStyle}
                />
              </div>
            </div>
          </div>

          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: 'var(--surface-color)' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-outline"
              data-testid="cancel-loan-btn"
              style={{ padding: '0.55rem 1.25rem', fontSize: '0.875rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn"
              data-testid="save-loan-btn"
              style={{ padding: '0.55rem 1.5rem', fontSize: '0.875rem' }}
            >
              {saving ? 'Saving…' : loanToEdit ? 'Save Changes' : 'Add Loan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const MonthlyTracker = () => {
  const { userEmail } = useAuth();
  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ready'
  const [cashflow, setCashflow] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileUnavailable, setProfileUnavailable] = useState(false);
  const [loans, setLoans] = useState([]);
  const [loansUnavailable, setLoansUnavailable] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');

  // Modals state
  const [estimatesModalOpen, setEstimatesModalOpen] = useState(false);
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [loanToEdit, setLoanToEdit] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    const [cashflowResult, profileResult, loansResult] = await Promise.allSettled([
      getCashflowSummary(),
      getDashboardProfile(),
      listLoans(),
    ]);

    if (cashflowResult.status === 'rejected') {
      setStatus('error');
      return;
    }

    const summary = cashflowResult.value || {};
    setCashflow(summary);

    setProfile(profileResult.status === 'fulfilled' ? profileResult.value : null);
    setProfileUnavailable(profileResult.status !== 'fulfilled');

    setLoans(loansResult.status === 'fulfilled' && Array.isArray(loansResult.value) ? loansResult.value : []);
    setLoansUnavailable(loansResult.status !== 'fulfilled');

    setSelectedMonth((current) => {
      const months = Array.isArray(summary.months) ? summary.months : [];
      if (current && months.some((entry) => entry.month === current)) return current;
      return getDefaultMonth(summary);
    });
    setStatus('ready');
  }, []);

  useEffect(() => {
    if (userEmail) load();
  }, [userEmail, load]);

  const handleOpenAddLoan = () => {
    setLoanToEdit(null);
    setLoanModalOpen(true);
  };

  const handleOpenEditLoan = (loan) => {
    setLoanToEdit(loan);
    setLoanModalOpen(true);
  };

  const handleDeleteLoan = async (loanId) => {
    if (!window.confirm('Are you sure you want to delete this loan?')) return;
    try {
      await deleteLoan(loanId);
      const refreshed = await listLoans();
      setLoans(Array.isArray(refreshed) ? refreshed : []);
    } catch (err) {
      alert(err?.message || 'Failed to delete loan.');
    }
  };

  const handleRefreshLoans = async () => {
    const refreshed = await listLoans();
    setLoans(Array.isArray(refreshed) ? refreshed : []);
  };

  const handleEstimatesSaved = (updatedFinancials) => {
    setProfile((prev) => {
      if (!prev) return { user: { hasOnboarded: true, financials: updatedFinancials } };
      if (prev.user) {
        return { ...prev, user: { ...prev.user, financials: updatedFinancials } };
      }
      return { ...prev, financials: updatedFinancials };
    });
    setProfileUnavailable(false);
  };

  if (status === 'loading') {
    return <div aria-live="polite" style={{ padding: '2rem' }}>Loading your monthly tracker…</div>;
  }

  if (status === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '560px' }}>
        <div role="alert" style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderLeft: '4px solid var(--error-color)', padding: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>Monthly tracker unavailable</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
            We could not load your monthly activity right now. Nothing was changed.
          </p>
          <button type="button" onClick={load} className="btn" style={{ padding: '0.6rem 1.25rem' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const months = Array.isArray(cashflow?.months) ? cashflow.months : [];
  const hasTransactions = months.length > 0;
  const monthOptions = getMonthOptions(cashflow);
  const monthView = selectMonthCashflow(cashflow, selectedMonth);
  const categoryRows = monthView ? formatCategoryBreakdown(monthView.categories) : [];
  const allTime = mapCashflowSummary(cashflow);
  const emiSummary = summarizeLoanEmis(loans);
  const financials = profile?.user?.financials || profile?.financials || null;
  const estimateIncome = financials ? sumProfileEstimate(financials.incomes) : null;
  const estimateExpenses = financials ? sumProfileEstimate(financials.monthlyExpenses) : null;

  const partialParts = [];
  if (profileUnavailable) partialParts.push('your saved profile estimates');
  if (loansUnavailable) partialParts.push('your loan details');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>Monthly Tracker</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0, maxWidth: '640px' }}>
          Your income, spending and loan obligations for the month, built only from your
          committed statement data and canonical account records.
        </p>
      </div>

      {partialParts.length > 0 && (
        <div role="status" data-testid="partial-data-notice" style={noticeStyle}>
          Partial data — we couldn&apos;t load {partialParts.join(' and ')} right now. Showing
          everything else below.
        </div>
      )}

      <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Monthly cash flow</h2>
            <span style={provenanceStyle}>Observed — from your committed statement transactions</span>
          </div>
          {monthOptions.length > 1 && (
            <label htmlFor="monthly-tracker-month-select" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Select month
              <select
                id="monthly-tracker-month-select"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)' }}
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!hasTransactions ? (
          <div data-testid="no-transactions" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              No committed statement transactions yet, so there is nothing observed to show
              for a month.
            </p>
            <Link to="/onboarding/csv" style={{ fontSize: '0.875rem', color: 'var(--accent-color)', width: 'fit-content' }}>
              Upload a statement to see your income and expenses here
            </Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <StatCard label="Income" value={formatPaise(monthView.income_paise)} testId="month-income" />
              <StatCard label="Expenses" value={formatPaise(monthView.expense_paise)} testId="month-expense" />
              <StatCard label="Net cash flow" value={formatPaise(monthView.net_paise)} testId="month-net" />
            </div>

            <div>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem 0' }}>Category breakdown</h3>
              {categoryRows.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  No categorized transactions for this month.
                </p>
              ) : (
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: '420px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                        <th style={{ padding: '0.6rem', fontWeight: 600 }}>Category</th>
                        <th style={{ padding: '0.6rem', fontWeight: 600, textAlign: 'right' }}>Income</th>
                        <th style={{ padding: '0.6rem', fontWeight: 600, textAlign: 'right' }}>Expense</th>
                        <th style={{ padding: '0.6rem', fontWeight: 600, textAlign: 'right' }}>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryRows.map((row) => (
                        <tr key={row.category ?? 'uncategorized'} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.6rem' }}>{row.label}</td>
                          <td style={{ padding: '0.6rem', textAlign: 'right' }}>{row.income}</td>
                          <td style={{ padding: '0.6rem', textAlign: 'right' }}>{row.expense}</td>
                          <td style={{ padding: '0.6rem', textAlign: 'right' }}>{row.net}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {allTime.hasHistory && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                Across all {months.length} committed {months.length === 1 ? 'month' : 'months'} on record:
                {' '}Income {rupeeFormatter.format(allTime.totals.income)} · Expenses {rupeeFormatter.format(allTime.totals.expenses)} · Net {rupeeFormatter.format(allTime.totals.net)}
              </p>
            )}
          </>
        )}
      </section>

      <section data-testid="loan-emi-section" style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Loan EMI obligations</h2>
          <button
            type="button"
            onClick={handleOpenAddLoan}
            data-testid="add-loan-btn"
            className="btn"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
          >
            + Add Loan
          </button>
        </div>

        {loansUnavailable ? (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }} data-testid="loans-unavailable">
            Your loan details could not be loaded right now, so EMI obligations aren&apos;t
            shown here.
          </p>
        ) : loans.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            No loans on file.
          </p>
        ) : (
          <>
            <div data-testid="loan-emi-total" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {emiSummary.knownCount === 0
                ? 'EMI unavailable for every loan on file.'
                : emiSummary.knownCount === emiSummary.totalCount
                  ? `Total monthly EMI: ${formatPaise(emiSummary.totalPaise)}`
                  : `Partial total (${emiSummary.knownCount} of ${emiSummary.totalCount} loans with a known EMI): ${formatPaise(emiSummary.totalPaise)}`}
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '420px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ padding: '0.6rem', fontWeight: 600 }}>Loan</th>
                    <th style={{ padding: '0.6rem', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '0.6rem', fontWeight: 600, textAlign: 'right' }}>Monthly EMI</th>
                    <th style={{ padding: '0.6rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr key={loan.loan_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.6rem' }}>{loan.name}</td>
                      <td style={{ padding: '0.6rem' }}>{loan.loan_type}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                        {loan.monthly_emi_paise === null || loan.monthly_emi_paise === undefined
                          ? 'EMI unavailable'
                          : formatPaise(loan.monthly_emi_paise)}
                      </td>
                      <td style={{ padding: '0.6rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditLoan(loan)}
                          data-testid={`edit-loan-${loan.loan_id}`}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '0.25rem 0.55rem',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            marginRight: '0.5rem',
                            borderRadius: '4px',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLoan(loan.loan_id)}
                          data-testid={`delete-loan-${loan.loan_id}`}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--error-color, #EF4444)',
                            color: 'var(--error-color, #EF4444)',
                            padding: '0.25rem 0.55rem',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            borderRadius: '4px',
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Profile estimate</h2>
            <span style={provenanceStyle}>Estimate — from your saved profile, not observed transactions</span>
          </div>
          <button
            type="button"
            onClick={() => setEstimatesModalOpen(true)}
            data-testid="edit-estimates-btn"
            className="btn-outline"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
          >
            Edit Estimates
          </button>
        </div>

        {profileUnavailable ? (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }} data-testid="profile-unavailable">
            Your saved profile could not be loaded right now, so these estimates aren&apos;t
            shown here.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <StatCard
              label="Estimated monthly income"
              value={estimateIncome === null ? 'Not available' : rupeeFormatter.format(estimateIncome)}
            />
            <StatCard
              label="Estimated monthly expenses"
              value={estimateExpenses === null ? 'Not available' : rupeeFormatter.format(estimateExpenses)}
            />
          </div>
        )}
      </section>

      {/* Modals */}
      <EstimatesModal
        isOpen={estimatesModalOpen}
        onClose={() => setEstimatesModalOpen(false)}
        currentFinancials={financials}
        onSaved={handleEstimatesSaved}
      />

      <LoanModal
        isOpen={loanModalOpen}
        onClose={() => setLoanModalOpen(false)}
        loanToEdit={loanToEdit}
        onSaved={handleRefreshLoans}
      />
    </div>
  );
};

export default MonthlyTracker;

