import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getFireForecast, getFireGoalImpact, getNetWorth } from '../../lib/fireApi.js';
import {
  GOAL_TYPES,
  buildCandidateGoal,
  buildFireChartRows,
  formatCoverageMonths,
  formatFireAge,
  formatPaiseINR,
  formatRatePct,
  formatWithdrawalPct,
} from '../../lib/fireFormat.js';

const cardStyle = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  padding: '1.25rem',
  minWidth: '200px',
  flex: '1 1 200px',
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
};

const SummaryCard = ({ label, value, sub, testId }) => (
  <div style={cardStyle}>
    <div style={cardLabelStyle}>{label}</div>
    <div style={cardValueStyle} {...(testId ? { 'data-testid': testId } : {})}>{value}</div>
    {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{sub}</div>}
  </div>
);

const AssumptionRow = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ fontWeight: 600 }}>{value}</span>
  </div>
);

function formatLakhAxis(value) {
  const lakh = Number(value) / 100000;
  if (Math.abs(lakh) >= 100) return `₹${Math.round(lakh)}L`;
  return `₹${Math.round(lakh * 10) / 10}L`;
}

const FireForecast = () => {
  const [status, setStatus] = useState('loading');
  const [forecast, setForecast] = useState(null);
  const [coverageMonths, setCoverageMonths] = useState(null);

  const [goalType, setGoalType] = useState('CAR');
  const [amountRupees, setAmountRupees] = useState('');
  const [targetAge, setTargetAge] = useState('');
  const [impact, setImpact] = useState({ status: 'idle', result: null, error: '' });

  const load = useCallback(async () => {
    setStatus('loading');
    const [fireResult, worthResult] = await Promise.allSettled([getFireForecast(), getNetWorth()]);
    if (fireResult.status === 'rejected' || fireResult.value === null || fireResult.value === undefined) {
      setStatus('error');
      return;
    }
    setForecast(fireResult.value);
    setCoverageMonths(
      worthResult.status === 'fulfilled'
        ? worthResult.value?.emergency_fund_coverage_months ?? null
        : null,
    );
    setStatus('ready');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitImpact = async (event) => {
    event.preventDefault();
    setImpact({ status: 'loading', result: null, error: '' });
    let candidate;
    try {
      candidate = buildCandidateGoal({ goalType, amountRupees, targetAge });
    } catch (err) {
      setImpact({ status: 'error', result: null, error: err.message });
      return;
    }
    try {
      const result = await getFireGoalImpact(candidate);
      setImpact({ status: 'done', result, error: '' });
    } catch {
      setImpact({ status: 'error', result: null, error: 'Could not estimate the impact right now. Try again.' });
    }
  };

  if (status === 'loading') {
    return <div aria-live="polite">Loading your FIRE forecast…</div>;
  }

  if (status === 'error' || !forecast) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '560px' }}>
        <Link to="/overview" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          ← Back to Overview
        </Link>
        <div role="alert" style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderLeft: '4px solid var(--error-color)', padding: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>FIRE forecast unavailable</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
            We could not load your forecast right now. Your stored data was not changed.
          </p>
          <button type="button" onClick={load} className="btn" style={{ padding: '0.6rem 1.25rem' }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const rows = buildFireChartRows(forecast.required_curve, forecast.projected_curve);
  const assumptions = forecast.assumptions || {};
  const firePoint = forecast.fire_age !== null && forecast.fire_age !== undefined
    ? rows.find((row) => row.age === forecast.fire_age)
    : null;
  const progress = forecast.progress_pct_today;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Link to="/overview" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
        ← Back to Overview
      </Link>

      <div>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>FIRE Forecast</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0, maxWidth: '640px' }}>
          Your projected corpus against the corpus you would need, under these assumptions.
          These are projections, not promises — not investment advice.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <SummaryCard label="FIRE age" value={formatFireAge(forecast.fire_age)} sub={forecast.fire_age === null || forecast.fire_age === undefined ? 'Not reached under these assumptions' : `Conservative check: ${formatFireAge(forecast.conservative_fire_age)}`} />
        <SummaryCard
          label="Required corpus at FIRE"
          value={forecast.required_corpus_at_fire_paise === null || forecast.required_corpus_at_fire_paise === undefined ? 'Not available' : formatPaiseINR(forecast.required_corpus_at_fire_paise)}
        />
        <SummaryCard
          label="Projected corpus at FIRE"
          value={forecast.projected_corpus_at_fire_paise === null || forecast.projected_corpus_at_fire_paise === undefined ? 'Not available' : formatPaiseINR(forecast.projected_corpus_at_fire_paise)}
        />
        <SummaryCard label="Implied withdrawal rate" value={formatWithdrawalPct(forecast.implied_withdrawal_rate_pct)} />
        <SummaryCard label="Progress today" value={progress === null || progress === undefined ? 'Not available' : `${Math.round(Number(progress) * 10) / 10}%`} />
        <SummaryCard label="Current runway" value={formatCoverageMonths(coverageMonths)} sub="Emergency fund coverage" testId="runway-value" />
      </div>

      <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 1rem 0' }}>Projected vs required corpus</h2>
        {rows.length > 0 ? (
          <div style={{ height: '320px', minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="age" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} minTickGap={24} label={{ value: 'Age', position: 'insideBottomRight', offset: -4, fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={formatLakhAxis} width={64} />
                <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} labelFormatter={(age) => `Age ${age}`} />
                <Legend />
                <Line type="monotone" dataKey="required" name="Required corpus" stroke="#B91C1C" strokeWidth={2} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="projected" name="Projected corpus" stroke="#064E3B" strokeWidth={2} dot={false} connectNulls={false} />
                {firePoint && firePoint.projected !== null && firePoint.projected !== undefined && (
                  <ReferenceDot x={forecast.fire_age} y={firePoint.projected} r={5} fill="#064E3B" stroke="#fff" label={{ value: `FIRE ${forecast.fire_age}`, fontSize: 12, position: 'top' }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            No projection curve was returned for this forecast.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ ...cardStyle, flex: '1 1 280px' }}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0' }}>Assumptions</h2>
          <AssumptionRow label="Inflation" value={formatRatePct(assumptions.inflation)} />
          <AssumptionRow label="Contribution step-up" value={formatRatePct(assumptions.step_up)} />
          <AssumptionRow label="Return before 40" value={formatRatePct(assumptions.return_before_40)} />
          <AssumptionRow label="Return 40–60" value={formatRatePct(assumptions.return_40_to_60)} />
          <AssumptionRow label="Return after 60" value={formatRatePct(assumptions.return_after_60)} />
          <AssumptionRow label="Post-FIRE return" value={assumptions.post_fire_return === null || assumptions.post_fire_return === undefined ? 'Same as above' : formatRatePct(assumptions.post_fire_return)} />
          <AssumptionRow label="Modelled to age" value={assumptions.lifespan_age ?? 'Not available'} />
        </div>

        <div style={{ ...cardStyle, flex: '1 1 280px' }}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0' }}>What this means</h2>
          {(forecast.warnings || []).length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {forecast.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
              No warnings were returned with this forecast. Estimates assume your contributions,
              expenses and returns stay close to the assumptions above.
            </p>
          )}
        </div>
      </div>

      <div style={{ ...cardStyle, flex: '1 1 100%' }}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0' }}>What if a life event happens?</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
          A read-only estimate — nothing is saved. See how a one-time expense could shift your
          FIRE age, under these assumptions.
        </p>
        <form onSubmit={submitImpact} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem', minWidth: '180px', flex: '1 1 180px' }}>
            Life-event type
            <select value={goalType} onChange={(event) => setGoalType(event.target.value)} style={{ padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)' }}>
              {GOAL_TYPES.map((type) => (
                <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem', minWidth: '160px', flex: '1 1 160px' }}>
            Amount today (₹)
            <input value={amountRupees} onChange={(event) => setAmountRupees(event.target.value)} inputMode="decimal" placeholder="e.g. 500000" style={{ padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem', minWidth: '140px', flex: '1 1 140px' }}>
            Target age
            <input value={targetAge} onChange={(event) => setTargetAge(event.target.value)} inputMode="numeric" placeholder="e.g. 35" style={{ padding: '0.6rem', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)' }} />
          </label>
          <button type="submit" className="btn" style={{ padding: '0.65rem 1.25rem' }}>
            See impact on FIRE age
          </button>
        </form>

        {impact.status === 'loading' && <p aria-live="polite" style={{ fontSize: '0.875rem' }}>Estimating impact…</p>}
        {impact.status === 'error' && impact.error && (
          <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--error-color)' }}>{impact.error}</p>
        )}
        {impact.status === 'done' && impact.result && (
          <div data-testid="goal-impact-result" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
            <div>
              <div style={cardLabelStyle}>Baseline FIRE age</div>
              <div style={{ fontWeight: 600, marginTop: '0.25rem' }}>{formatFireAge(impact.result.baseline_fire_age)}</div>
            </div>
            <div>
              <div style={cardLabelStyle}>With this goal</div>
              <div style={{ fontWeight: 600, marginTop: '0.25rem' }}>{formatFireAge(impact.result.with_goal_fire_age)}</div>
            </div>
            <div>
              <div style={cardLabelStyle}>Shift</div>
              <div style={{ fontWeight: 600, marginTop: '0.25rem' }}>
                {impact.result.delta_years === null || impact.result.delta_years === undefined
                  ? 'Not available'
                  : `+${impact.result.delta_years} years`}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FireForecast;
