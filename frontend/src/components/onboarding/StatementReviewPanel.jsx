import React, { useEffect, useState } from 'react';
import Button from '../ui/Button';

const CATEGORIES = [
  'INCOME', 'RENT', 'GROCERIES', 'FOOD_DELIVERY', 'DINING', 'TRANSPORT', 'SHOPPING',
  'UTILITIES', 'SUBSCRIPTIONS', 'EMI', 'INVESTMENTS', 'TRANSFER', 'HEALTH', 'EDUCATION',
  'ENTERTAINMENT', 'OTHER',
];

function rupeesInput(paise) {
  return paise === null || paise === undefined ? '' : String(Number(paise) / 100);
}

function parseRupees(value, allowNegative = false) {
  const text = value.trim();
  if (!text) return null;
  const pattern = allowNegative ? /^-?\d+(?:\.\d{0,2})?$/ : /^\d+(?:\.\d{0,2})?$/;
  if (!pattern.test(text)) return undefined;
  const sign = text.startsWith('-') ? -1 : 1;
  const unsigned = sign < 0 ? text.slice(1) : text;
  const [whole, fraction = ''] = unsigned.split('.');
  return sign * (Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
}

const StatementReviewPanel = ({ review, onRowChange, onConfirm, confirming = false }) => {
  const [validationError, setValidationError] = useState('');
  const [invalidBalanceIds, setInvalidBalanceIds] = useState(() => new Set());
  const [balanceDrafts, setBalanceDrafts] = useState(() => Object.fromEntries(review.review_rows.map((row) => [row.txn_id, rupeesInput(row.balance_paise)])));
  const summary = review.validation_summary || {};
  const reconciled = review.reconciliation_summary?.reconciled ?? summary.reconciled;

  useEffect(() => {
    setBalanceDrafts(Object.fromEntries(review.review_rows.map((row) => [row.txn_id, rupeesInput(row.balance_paise)])));
    setInvalidBalanceIds(new Set());
    setValidationError('');
  }, [review.job_id]);

  function handleConfirm() {
    const invalidAmount = review.review_rows.some((row) => !Number.isInteger(row.amount_paise) || row.amount_paise <= 0);
    const invalidBalance = invalidBalanceIds.size > 0 || review.review_rows.some((row) => row.balance_paise !== null && row.balance_paise !== undefined && !Number.isInteger(row.balance_paise));
    if (invalidAmount) {
      setValidationError('Each transaction amount must be a positive amount in rupees.');
      return;
    }
    if (invalidBalance) {
      setValidationError('Running balances must be valid rupee amounts with at most two decimal places, or left empty.');
      return;
    }
    setValidationError('');
    onConfirm();
  }

  function handleBalanceChange(row, value) {
    const parsed = parseRupees(value, true);
    const text = value.trim();
    const complete = /^-?\d+(?:\.\d{1,2})?$/.test(text) || /^-?\d+$/.test(text);
    setBalanceDrafts((current) => ({ ...current, [row.txn_id]: value }));
    if (text && (!complete || parsed === undefined)) {
      setInvalidBalanceIds((current) => new Set(current).add(row.txn_id));
      return;
    }
    setInvalidBalanceIds((current) => {
      const next = new Set(current);
      next.delete(row.txn_id);
      return next;
    });
    onRowChange(row.txn_id, 'balance_paise', parsed);
  }

  return (
    <section aria-labelledby="statement-review-heading" style={{ border: '1px solid var(--border-color)', padding: '1.5rem' }}>
      <h3 id="statement-review-heading" style={{ marginTop: 0 }}>Review your CSV before saving</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
        {summary.row_count || review.review_rows.length} transactions extracted. {reconciled ? 'Balances reconcile.' : 'Balance reconciliation needs attention.'}
      </p>
      {!reconciled && <div role="alert" style={{ color: 'var(--error-color)', fontSize: '0.875rem' }}>Balance reconciliation needs attention before relying on these values.</div>}
      {validationError && <div role="alert" style={{ color: 'var(--error-color)', fontSize: '0.875rem' }}>{validationError}</div>}
      <p style={{ fontSize: '0.875rem' }}>No transaction is saved until you confirm. Correct each field below if needed.</p>
      <div style={{ overflowX: 'auto' }}>
        <table aria-label="Statement transactions to review" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px' }}>
          <caption style={{ textAlign: 'left', padding: '0.5rem 0' }}>Editable statement transactions</caption>
          <thead>
            <tr>
              <th scope="col">Date</th><th scope="col">Description</th><th scope="col">Direction</th><th scope="col">Amount (₹)</th><th scope="col">Category</th><th scope="col">Running balance (₹)</th>
            </tr>
          </thead>
          <tbody>
            {review.review_rows.map((row) => (
              <tr key={row.txn_id}>
                <td><input aria-label={`Date for ${row.description}`} type="date" value={row.txn_date || ''} onChange={(event) => onRowChange(row.txn_id, 'txn_date', event.target.value)} /></td>
                <td><input aria-label={`Description for ${row.description}`} type="text" value={row.description || ''} onChange={(event) => onRowChange(row.txn_id, 'description', event.target.value)} /></td>
                <td>
                  <select aria-label={`Direction for ${row.description}`} value={row.direction || 'DEBIT'} onChange={(event) => onRowChange(row.txn_id, 'direction', event.target.value)}>
                    <option value="CREDIT">CREDIT</option><option value="DEBIT">DEBIT</option>
                  </select>
                </td>
                <td><input aria-label={`Amount for ${row.description}`} type="number" min="0.01" step="0.01" value={rupeesInput(row.amount_paise)} onChange={(event) => onRowChange(row.txn_id, 'amount_paise', parseRupees(event.target.value))} /></td>
                <td>
                  <select aria-label={`Category for ${row.description}`} value={row.category || 'OTHER'} onChange={(event) => onRowChange(row.txn_id, 'category', event.target.value)}>
                    {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </td>
                <td><input aria-label={`Running balance for ${row.description}`} type="text" inputMode="decimal" value={balanceDrafts[row.txn_id] ?? ''} onChange={(event) => handleBalanceChange(row, event.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button onClick={handleConfirm} disabled={confirming} style={{ width: 'auto', marginTop: '1rem' }}>
        {confirming ? 'Saving reviewed statement…' : 'Save reviewed statement & use these values'}
      </Button>
    </section>
  );
};

export default StatementReviewPanel;
