import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { getCashflowSummary, saveDashboardFinancials } from '../lib/dashboardApi.js';
import { commitStatement, uploadAndProcessCsv } from '../lib/statementsApi.js';
import { paiseToRupees } from '../lib/onboarding.js';

const CSVUpload = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!file) {
      setError('Choose a CSV statement file first.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const result = await uploadAndProcessCsv(file);
      setReview(result);
      setConfirmed(false);
    } catch (err) {
      setError(err?.message || 'The statement could not be processed. Check the CSV headers and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!review || !confirmed) return;
    setError('');
    setSaving(true);
    try {
      await commitStatement(review.job_id);
      const cashflow = await getCashflowSummary();
      const rows = review.review_rows || [];
      const latestBalance = [...rows].reverse().find((row) => Number.isInteger(row.balance_paise))?.balance_paise;
      const currentBalance = cashflow?.current_balance_paise ?? latestBalance;
      const extractedData = {
        fileName: file.name,
        totalTransactions: rows.length,
        currentBalance: currentBalance === undefined || currentBalance === null ? '' : paiseToRupees(currentBalance),
        monthlyRevenue: paiseToRupees(cashflow?.totals?.income_paise || 0),
        monthlyExpenses: paiseToRupees(cashflow?.totals?.expense_paise || 0),
      };
      await saveDashboardFinancials({ onboardingMethod: 'csv_extraction', extractedData });
      navigate('/overview');
    } catch (err) {
      setError(err?.message || 'The reviewed statement could not be saved. Nothing was added to the dashboard.');
    } finally {
      setSaving(false);
    }
  };

  const rows = review?.review_rows || [];
  const totals = review?.validation_summary || {};

  return (
    <div style={{ width: '100%', maxWidth: '600px', background: 'var(--surface-color)', padding: '3rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>
      <h2 style={{ marginBottom: '1.5rem' }}>Upload Financial Data</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.6' }}>
        Upload your bank statements, portfolio exports, or expense sheets (CSV format). We will automatically extract your complete financial profile including your assets, diverse income streams (job, business, rental), stock and mutual fund holdings, EMIs, and daily living expenses.
      </p>

      <div style={{ padding: '2rem', border: '1px dashed var(--border-color)', marginBottom: '2rem', background: 'var(--background-color)' }}>
        <input 
          type="file" 
          accept=".csv" 
          onChange={(e) => { setFile(e.target.files?.[0] || null); setReview(null); setError(''); }}
          style={{ width: '100%' }}
        />
      </div>

      {error && <p role="alert" style={{ color: 'var(--error-color)', marginBottom: '1rem', textAlign: 'left' }}>{error}</p>}

      {!review && <Button onClick={handleUpload} disabled={loading || !file}>
        {loading ? 'Reading Statement...' : 'Upload and Extract'}
      </Button>}

      {review && (
        <div style={{ textAlign: 'left', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <strong>Review before saving</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{rows.length} transactions</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <span>Income ₹{paiseToRupees(totals.credit_total_paise || 0)}</span>
            <span>Expenses ₹{paiseToRupees(totals.debit_total_paise || 0)}</span>
            <span>Net ₹{paiseToRupees(totals.net_paise || 0)}</span>
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
            {rows.map((row) => (
              <div key={row.txn_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.65rem 0.75rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                <span>{row.txn_date} · {row.description}<br /><small style={{ color: 'var(--text-secondary)' }}>{row.category}</small></span>
                <span style={{ whiteSpace: 'nowrap', color: row.direction === 'CREDIT' ? 'var(--accent-color)' : 'var(--error-color)' }}>{row.direction === 'CREDIT' ? '+' : '-'}₹{paiseToRupees(row.amount_paise)}</span>
              </div>
            ))}
          </div>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.85rem', lineHeight: 1.4, marginBottom: '1rem' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I reviewed these rows and confirm they can be saved to my transactions.
          </label>
          <Button onClick={handleCommit} disabled={saving || !confirmed}>
            {saving ? 'Saving Transactions...' : 'Confirm and Save'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default CSVUpload;
