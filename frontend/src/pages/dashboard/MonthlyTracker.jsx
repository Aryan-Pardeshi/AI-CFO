import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getDashboardProfile, getCashflowSummary } from '../../lib/dashboardApi.js';
import { listLoans } from '../../lib/api.js';
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

const MonthlyTracker = () => {
  const { userEmail } = useAuth();
  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ready'
  const [cashflow, setCashflow] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileUnavailable, setProfileUnavailable] = useState(false);
  const [loans, setLoans] = useState([]);
  const [loansUnavailable, setLoansUnavailable] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');

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
  const financials = profile?.user?.financials || null;
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
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Loan EMI obligations</h2>
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
              <table style={{ width: '100%', minWidth: '360px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ padding: '0.6rem', fontWeight: 600 }}>Loan</th>
                    <th style={{ padding: '0.6rem', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '0.6rem', fontWeight: 600, textAlign: 'right' }}>Monthly EMI</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Profile estimate</h2>
          <span style={provenanceStyle}>Estimate — from your saved profile, not observed transactions</span>
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
    </div>
  );
};

export default MonthlyTracker;
