/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MonthlyMoney from './MonthlyMoney.jsx';
import { commitStatement, uploadAndProcessCsv } from '../../lib/statementsApi.js';

vi.mock('../../lib/statementsApi.js', () => ({
  uploadAndProcessCsv: vi.fn(),
  commitStatement: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const reviewedStatement = {
  job_id: 'job-1',
  status: 'REVIEW_REQUIRED',
  validation_summary: {
    row_count: 5,
    credit_total_paise: 8500000,
    debit_total_paise: 3050000,
    net_paise: 5450000,
    reconciled: true,
    balance_delta_paise: 0,
  },
  reconciliation_summary: { reconciled: true, balance_delta_paise: 0 },
  review_rows: [
    { txn_id: 'salary', txn_date: '2026-09-01', description: 'Salary', amount_paise: 8500000, direction: 'CREDIT', category: 'INCOME', category_source: 'rule', balance_paise: 9000000 },
    { txn_id: 'food', txn_date: '2026-09-02', description: 'SWIGGY', amount_paise: 50000, direction: 'DEBIT', category: 'FOOD_DELIVERY', category_source: 'rule', balance_paise: 8950000 },
    { txn_id: 'rent', txn_date: '2026-09-03', description: 'Rent', amount_paise: 2000000, direction: 'DEBIT', category: 'RENT', category_source: 'rule', balance_paise: 6950000 },
    { txn_id: 'investment', txn_date: '2026-09-04', description: 'SIP', amount_paise: 250000, direction: 'DEBIT', category: 'INVESTMENTS', category_source: 'rule', balance_paise: 6700000 },
    { txn_id: 'emi', txn_date: '2026-09-05', description: 'Loan EMI', amount_paise: 750000, direction: 'DEBIT', category: 'EMI', category_source: 'rule', balance_paise: 5950000 },
  ],
};

describe('MonthlyMoney CSV statement autofill', () => {
  test('blocks confirmation when a transaction amount is empty, invalid, or zero', async () => {
    uploadAndProcessCsv.mockResolvedValue(reviewedStatement);
    const user = userEvent.setup();
    render(<MonthlyMoney profile={{}} saveAndAdvance={vi.fn()} goBack={vi.fn()} />);
    await user.upload(screen.getByLabelText(/CSV statement/i), new File(['x'], 'bank.csv', { type: 'text/csv' }));
    const amount = screen.getByLabelText('Amount for Salary');
    await user.clear(amount);
    await user.click(screen.getByRole('button', { name: /save reviewed statement/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/each transaction amount must be a positive amount/i);
    expect(commitStatement).not.toHaveBeenCalled();
    await user.type(amount, '0');
    await user.click(screen.getByRole('button', { name: /save reviewed statement/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/each transaction amount must be a positive amount/i);
    expect(commitStatement).not.toHaveBeenCalled();
  });

  test('blocks confirmation for malformed non-empty running balance input', async () => {
    uploadAndProcessCsv.mockResolvedValue(reviewedStatement);
    const user = userEvent.setup();
    render(<MonthlyMoney profile={{}} saveAndAdvance={vi.fn()} goBack={vi.fn()} />);
    await user.upload(screen.getByLabelText(/CSV statement/i), new File(['x'], 'bank.csv', { type: 'text/csv' }));
    const balance = screen.getByLabelText('Running balance for Salary');
    fireEvent.change(balance, { target: { value: '123.456' } });
    await user.click(screen.getByRole('button', { name: /save reviewed statement/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/running balances must be valid rupee amounts/i);
    expect(commitStatement).not.toHaveBeenCalled();
  });

  test('commits a blank running balance as null', async () => {
    uploadAndProcessCsv.mockResolvedValue(reviewedStatement);
    commitStatement.mockResolvedValue({ status: 'COMMITTED', committed_row_count: 5 });
    const user = userEvent.setup();
    render(<MonthlyMoney profile={{}} saveAndAdvance={vi.fn()} goBack={vi.fn()} />);
    await user.upload(screen.getByLabelText(/CSV statement/i), new File(['x'], 'bank.csv', { type: 'text/csv' }));
    await user.clear(screen.getByLabelText('Running balance for Salary'));
    await user.click(screen.getByRole('button', { name: /save reviewed statement/i }));
    await waitFor(() => expect(commitStatement).toHaveBeenCalled());
    expect(commitStatement.mock.calls[0][1][0].balance_paise).toBeNull();
  });

  test('commits a valid negative running balance as signed integer paise', async () => {
    uploadAndProcessCsv.mockResolvedValue(reviewedStatement);
    commitStatement.mockResolvedValue({ status: 'COMMITTED', committed_row_count: 5 });
    const user = userEvent.setup();
    render(<MonthlyMoney profile={{}} saveAndAdvance={vi.fn()} goBack={vi.fn()} />);
    await user.upload(screen.getByLabelText(/CSV statement/i), new File(['x'], 'bank.csv', { type: 'text/csv' }));
    const balance = screen.getByLabelText('Running balance for Salary');
    await user.clear(balance);
    await user.type(balance, '-123.45');
    await user.click(screen.getByRole('button', { name: /save reviewed statement/i }));
    await waitFor(() => expect(commitStatement).toHaveBeenCalled());
    expect(commitStatement.mock.calls[0][1][0].balance_paise).toBe(-12345);
  });

  test('preserves a normally typed decimal running balance as integer paise', async () => {
    uploadAndProcessCsv.mockResolvedValue(reviewedStatement);
    commitStatement.mockResolvedValue({ status: 'COMMITTED', committed_row_count: 5 });
    const user = userEvent.setup();
    render(<MonthlyMoney profile={{}} saveAndAdvance={vi.fn()} goBack={vi.fn()} />);
    await user.upload(screen.getByLabelText(/CSV statement/i), new File(['x'], 'bank.csv', { type: 'text/csv' }));
    const balance = screen.getByLabelText('Running balance for Salary');
    await user.clear(balance);
    await user.type(balance, '123.45');
    await user.click(screen.getByRole('button', { name: /save reviewed statement/i }));
    await waitFor(() => expect(commitStatement).toHaveBeenCalled());
    expect(commitStatement.mock.calls[0][1][0].balance_paise).toBe(12345);
  });

  test('allows correcting every review field and commits edits before deriving autofill', async () => {
    uploadAndProcessCsv.mockResolvedValue(reviewedStatement);
    commitStatement.mockResolvedValue({ status: 'COMMITTED', committed_row_count: 5 });
    const user = userEvent.setup();
    render(<MonthlyMoney profile={{}} saveAndAdvance={vi.fn()} goBack={vi.fn()} />);

    await user.upload(screen.getByLabelText(/CSV statement/i), new File(['x'], 'bank.csv', { type: 'text/csv' }));
    await screen.findByRole('table');
    const date = screen.getByLabelText('Date for Salary');
    const description = screen.getByLabelText('Description for Salary');
    const amount = screen.getByLabelText('Amount for Salary');
    const direction = screen.getByLabelText('Direction for Salary');
    const category = screen.getByLabelText('Category for Salary');
    const balance = screen.getByLabelText('Running balance for Salary');
    await user.clear(date);
    await user.type(date, '2026-09-10');
    await user.clear(description);
    await user.type(description, 'New salary');
    await user.clear(amount);
    await user.type(amount, '90000');
    await user.selectOptions(direction, 'DEBIT');
    await user.selectOptions(category, 'OTHER');
    await user.clear(balance);
    await user.type(balance, '123456');
    await user.click(screen.getByRole('button', { name: /save reviewed statement/i }));

    await waitFor(() => expect(commitStatement).toHaveBeenCalled());
    const committedRows = commitStatement.mock.calls[0][1];
    expect(committedRows[0]).toMatchObject({
      txn_date: '2026-09-10', description: 'New salary', amount_paise: 9000000,
      direction: 'DEBIT', category: 'OTHER', category_source: 'user', balance_paise: 12345600,
    });
    expect(screen.getByLabelText('Job / Salary')).toHaveValue('0');
  });

  test('marks unreconciled reviews as needing attention', async () => {
    uploadAndProcessCsv.mockResolvedValue({ ...reviewedStatement, reconciliation_summary: { reconciled: false, balance_delta_paise: 100 } });
    const user = userEvent.setup();
    render(<MonthlyMoney profile={{}} saveAndAdvance={vi.fn()} goBack={vi.fn()} />);
    await user.upload(screen.getByLabelText(/CSV statement/i), new File(['x'], 'bank.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/reconciliation needs attention/i);
  });

  test('does not autofill while commit is unresolved, then applies values after it resolves', async () => {
    uploadAndProcessCsv.mockResolvedValue(reviewedStatement);
    let resolveCommit;
    commitStatement.mockImplementation(() => new Promise((resolve) => { resolveCommit = resolve; }));
    const user = userEvent.setup();
    render(<MonthlyMoney profile={{}} saveAndAdvance={vi.fn()} goBack={vi.fn()} />);

    const file = new File(['date,narration,debit,credit\n'], 'bank.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText(/CSV statement/i), file);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Salary')).toBeInTheDocument();
    expect(screen.getByText(/No transaction is saved until you confirm/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Job / Salary')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: /save reviewed statement/i }));

    await waitFor(() => expect(commitStatement).toHaveBeenCalled());
    expect(screen.getByLabelText(/CSV statement/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /saving reviewed statement/i })).toBeDisabled();
    expect(screen.getByLabelText('Job / Salary')).toHaveValue('');
    expect(screen.getByRole('table')).toBeInTheDocument();
    resolveCommit({ status: 'COMMITTED', committed_row_count: 5 });
    await waitFor(() => expect(screen.getByLabelText('Job / Salary')).toHaveValue('85000'));
    expect(screen.getByLabelText('Food / Groceries')).toHaveValue('500');
    expect(screen.getByLabelText('Rent')).toHaveValue('20000');
    expect(screen.getByLabelText('Monthly investment')).toHaveValue('2500');
    expect(screen.getByLabelText('Current account balance')).toHaveValue('59500');
    expect(screen.getByLabelText('Miscellaneous')).toHaveValue('0');
    expect(commitStatement).toHaveBeenCalledWith('job-1', reviewedStatement.review_rows);
  });

  test('disables review confirmation while a new import is pending', async () => {
    let resolveImport;
    uploadAndProcessCsv
      .mockResolvedValueOnce(reviewedStatement)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveImport = resolve; }));
    const user = userEvent.setup();
    render(<MonthlyMoney profile={{}} saveAndAdvance={vi.fn()} goBack={vi.fn()} />);
    const fileInput = screen.getByLabelText(/CSV statement/i);
    await user.upload(fileInput, new File(['x'], 'first.csv', { type: 'text/csv' }));
    await screen.findByRole('table');
    await user.upload(fileInput, new File(['x'], 'second.csv', { type: 'text/csv' }));
    expect(fileInput).toBeDisabled();
    expect(screen.getByRole('button', { name: /saving reviewed statement/i })).toBeDisabled();
    expect(screen.getByLabelText('Job / Salary')).toHaveValue('');
    resolveImport(reviewedStatement);
    await waitFor(() => expect(fileInput).not.toBeDisabled());
  });

  test('does not alter form values when committing the review fails', async () => {
    uploadAndProcessCsv.mockResolvedValue(reviewedStatement);
    commitStatement
      .mockRejectedValueOnce(new Error('The statement service is unavailable.'))
      .mockResolvedValueOnce({ status: 'COMMITTED', committed_row_count: 5 });
    const user = userEvent.setup();
    render(<MonthlyMoney profile={{}} saveAndAdvance={vi.fn()} goBack={vi.fn()} />);

    await user.upload(screen.getByLabelText(/CSV statement/i), new File(['x'], 'bank.csv', { type: 'text/csv' }));
    await user.click(await screen.findByRole('button', { name: /save reviewed statement/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The statement service is unavailable.');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Job / Salary')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: /save reviewed statement/i }));
    await waitFor(() => expect(screen.getByLabelText('Job / Salary')).toHaveValue('85000'));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
