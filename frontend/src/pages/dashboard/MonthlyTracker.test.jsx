/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ userEmail: 'demo@example.com' }),
}));

vi.mock('../../lib/dashboardApi.js', () => ({
  getDashboardProfile: vi.fn(),
  getCashflowSummary: vi.fn(),
  saveDashboardFinancials: vi.fn(),
}));

vi.mock('../../lib/api.js', () => ({
  listLoans: vi.fn(),
  createLoan: vi.fn(),
  updateLoan: vi.fn(),
  deleteLoan: vi.fn(),
}));

import MonthlyTracker from './MonthlyTracker.jsx';
import { getCashflowSummary, getDashboardProfile, saveDashboardFinancials } from '../../lib/dashboardApi.js';
import { listLoans, createLoan, updateLoan, deleteLoan } from '../../lib/api.js';

const twoMonthCashflow = {
  months: [
    {
      month: '2026-07',
      income_paise: 8000000,
      expense_paise: 4000000,
      net_paise: 4000000,
      categories: [
        { category: 'RENT', income_paise: 0, expense_paise: 2500000, net_paise: -2500000 },
        { category: 'GROCERIES', income_paise: 0, expense_paise: 1500000, net_paise: -1500000 },
      ],
    },
    {
      month: '2026-08',
      income_paise: 8500000,
      expense_paise: 5000000,
      net_paise: 3500000,
      categories: [
        { category: 'RENT', income_paise: 0, expense_paise: 2500000, net_paise: -2500000 },
        { category: null, income_paise: 0, expense_paise: 2500000, net_paise: -2500000 },
      ],
    },
  ],
  totals: { income_paise: 16500000, expense_paise: 9000000, net_paise: 7500000 },
  current_balance_paise: 12000050,
};

const precisionCashflow = {
  months: [
    {
      month: '2026-09',
      income_paise: 100000001,
      expense_paise: 100,
      net_paise: 99999901,
      categories: [
        { category: 'RENT', income_paise: 1, expense_paise: 0, net_paise: 1 },
        { category: 'GROCERIES', income_paise: 0, expense_paise: 99, net_paise: -99 },
        { category: 'EDUCATION', income_paise: 100000000, expense_paise: 1, net_paise: 99999999 },
      ],
    },
  ],
  totals: { income_paise: 100000001, expense_paise: 100, net_paise: 99999901 },
  current_balance_paise: 100000001,
};

const profileFixture = {
  user: {
    hasOnboarded: true,
    financials: {
      incomes: { salary: '85000.00', other: '0.00' },
      monthlyExpenses: { total: '50000.00' },
    },
  },
};

const loanFixture = [
  { loan_id: 'l1', name: 'Home loan', loan_type: 'HOME', monthly_emi_paise: 4500000 },
  { loan_id: 'l2', name: 'Car loan', loan_type: 'CAR', monthly_emi_paise: 1200000 },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <MonthlyTracker />
    </MemoryRouter>,
  );
}

describe('MonthlyTracker page (canonical data only, no fabricated figures)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('shows a loading state while fetching', () => {
    getCashflowSummary.mockReturnValue(new Promise(() => {}));
    getDashboardProfile.mockReturnValue(new Promise(() => {}));
    listLoans.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('ready state: selected month defaults to the most recent month and shows exact paise-derived figures', async () => {
    getCashflowSummary.mockResolvedValue(twoMonthCashflow);
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue(loanFixture);
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: /monthly tracker/i })).toBeInTheDocument());

    // Defaults to the most recent month (2026-08 / Aug 2026)
    expect(screen.getByLabelText(/select month/i)).toHaveValue('2026-08');
    expect(screen.getByTestId('month-income')).toHaveTextContent('85,000.00');
    expect(screen.getByTestId('month-expense')).toHaveTextContent('50,000.00');
    expect(screen.getByTestId('month-net')).toHaveTextContent('35,000.00');

    // Category breakdown for August: RENT and Uncategorized (null category)
    expect(screen.getByText('Rent')).toBeInTheDocument();
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();

    // Provenance labelling is explicit and distinguishes observed vs estimate
    expect(screen.getByText(/observed.*committed statement transactions/i)).toBeInTheDocument();
    expect(screen.getByText(/estimate.*saved profile, not observed transactions/i)).toBeInTheDocument();
  });

  test('month selection switches the displayed figures', async () => {
    getCashflowSummary.mockResolvedValue(twoMonthCashflow);
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue(loanFixture);
    renderPage();

    await waitFor(() => expect(screen.getByTestId('month-income')).toHaveTextContent('85,000.00'));

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/select month/i), '2026-07');

    await waitFor(() => expect(screen.getByTestId('month-income')).toHaveTextContent('80,000.00'));
    expect(screen.getByTestId('month-expense')).toHaveTextContent('40,000.00');
    expect(screen.getByTestId('month-net')).toHaveTextContent('40,000.00');
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });

  test('month selector is not shown when there is only one month', async () => {
    getCashflowSummary.mockResolvedValue(precisionCashflow);
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue(loanFixture);
    renderPage();

    await waitFor(() => expect(screen.getByTestId('month-income')).toBeInTheDocument());
    expect(screen.queryByLabelText(/select month/i)).not.toBeInTheDocument();
  });

  test('paise precision: exact rupee strings render with no floating-point drift', async () => {
    getCashflowSummary.mockResolvedValue(precisionCashflow);
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue(loanFixture);
    renderPage();

    await waitFor(() => expect(screen.getByTestId('month-income')).toBeInTheDocument());
    // 100000001 paise = exactly ₹10,00,000.01 — never a long floating tail
    expect(screen.getByTestId('month-income')).toHaveTextContent('10,00,000.01');
    // 100 paise = exactly ₹1.00, and 99999901 paise = exactly ₹9,99,999.01 —
    // neither shows the long decimal tail a 0.1 + 0.2-class float bug would produce.
    expect(screen.getByTestId('month-expense')).toHaveTextContent('₹1.00');
    expect(screen.getByTestId('month-net')).toHaveTextContent('9,99,999.01');
    expect(screen.getByTestId('month-income')).not.toHaveTextContent(/\.\d{3,}/);
    expect(screen.getByTestId('month-net')).not.toHaveTextContent(/\.\d{3,}/);

    // Category rows for the same month: 1 paise, 99 paise and a large amount all render exactly.
    // RENT: income_paise 1, expense_paise 0, net_paise 1 -> "₹0.01" appears twice in the row.
    const rentRow = screen.getByText('Rent').closest('tr');
    expect(within(rentRow).getAllByText('₹0.01')).toHaveLength(2);
    const groceriesRow = screen.getByText('Groceries').closest('tr');
    expect(within(groceriesRow).getByText('₹0.99')).toBeInTheDocument();
  });

  test('cashflow request fails -> error state with a working Retry that re-invokes the API', async () => {
    getCashflowSummary.mockRejectedValueOnce(new Error('boom 500 internal-secret'));
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue(loanFixture);
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/internal-secret/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('month-income')).not.toBeInTheDocument();

    getCashflowSummary.mockResolvedValue(twoMonthCashflow);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByTestId('month-income')).toBeInTheDocument());
    expect(getCashflowSummary).toHaveBeenCalledTimes(2);
  });

  test('loans request fails -> partial notice, never a zeroed EMI', async () => {
    getCashflowSummary.mockResolvedValue(twoMonthCashflow);
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockRejectedValue(new Error('loans down'));
    renderPage();

    await waitFor(() => expect(screen.getByTestId('partial-data-notice')).toBeInTheDocument());
    expect(screen.getByTestId('partial-data-notice')).toHaveTextContent(/loan details/i);
    expect(screen.getByTestId('loans-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('loan-emi-total')).not.toBeInTheDocument();
    const loanSection = screen.getByTestId('loan-emi-section');
    expect(within(loanSection).queryByText(/₹/)).not.toBeInTheDocument();
    expect(screen.queryByText('Home loan')).not.toBeInTheDocument();
  });

  test('profile request fails -> partial notice, estimate section shows unavailable, no invented figures', async () => {
    getCashflowSummary.mockResolvedValue(twoMonthCashflow);
    getDashboardProfile.mockRejectedValue(new Error('profile down'));
    listLoans.mockResolvedValue(loanFixture);
    renderPage();

    await waitFor(() => expect(screen.getByTestId('partial-data-notice')).toBeInTheDocument());
    expect(screen.getByTestId('partial-data-notice')).toHaveTextContent(/profile estimates/i);
    expect(screen.getByTestId('profile-unavailable')).toBeInTheDocument();
  });

  test('no committed transactions -> no-transactions state pointing at statement upload', async () => {
    getCashflowSummary.mockResolvedValue({ months: [], totals: { income_paise: 0, expense_paise: 0, net_paise: 0 }, current_balance_paise: null });
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue(loanFixture);
    renderPage();

    await waitFor(() => expect(screen.getByTestId('no-transactions')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /upload a statement/i })).toBeInTheDocument();
    expect(screen.queryByTestId('month-income')).not.toBeInTheDocument();
    // Loan section is independent of transaction history and still renders
    expect(screen.getByText('Home loan')).toBeInTheDocument();
  });

  test('a loan with monthly_emi_paise null renders "unavailable", never 0', async () => {
    getCashflowSummary.mockResolvedValue(twoMonthCashflow);
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue([
      { loan_id: 'l1', name: 'Personal loan', loan_type: 'PERSONAL', monthly_emi_paise: null },
      { loan_id: 'l2', name: 'Car loan', loan_type: 'CAR', monthly_emi_paise: 1200000 },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Personal loan')).toBeInTheDocument());
    const personalRow = screen.getByText('Personal loan').closest('tr');
    expect(within(personalRow).getByText('EMI unavailable')).toBeInTheDocument();
    expect(within(personalRow).queryByText(/₹0\.00/)).not.toBeInTheDocument();

    // Total is a partial total across the one known EMI, not a zero
    expect(screen.getByTestId('loan-emi-total')).toHaveTextContent(/partial total/i);
    expect(screen.getByTestId('loan-emi-total')).toHaveTextContent('1 of 2');
  });

  test('user isolation: no api helper is ever called with an identity argument', async () => {
    getCashflowSummary.mockResolvedValue(twoMonthCashflow);
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue(loanFixture);
    renderPage();

    await waitFor(() => expect(getCashflowSummary).toHaveBeenCalled());
    expect(getCashflowSummary.mock.calls[0]).toEqual([]);
    expect(getDashboardProfile.mock.calls[0]).toEqual([]);
    expect(listLoans.mock.calls[0]).toEqual([]);
  });

  test('edit estimates modal: opens, modifies income/expenses, and saves via saveDashboardFinancials', async () => {
    getCashflowSummary.mockResolvedValue(twoMonthCashflow);
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue(loanFixture);
    saveDashboardFinancials.mockResolvedValue({ hasOnboarded: true });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('edit-estimates-btn')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByTestId('edit-estimates-btn'));

    expect(screen.getByTestId('estimates-modal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /edit monthly estimates/i })).toBeInTheDocument();

    const salaryInput = screen.getByLabelText(/salary \/ wages/i);
    await user.clear(salaryInput);
    await user.type(salaryInput, '95000');

    const foodInput = screen.getByLabelText(/food & groceries/i);
    await user.clear(foodInput);
    await user.type(foodInput, '18000');

    await user.click(screen.getByTestId('save-estimates-btn'));

    await waitFor(() => expect(saveDashboardFinancials).toHaveBeenCalledTimes(1));
    const savedFinancials = saveDashboardFinancials.mock.calls[0][0];
    expect(savedFinancials.incomes.jobSalary).toBe('95000.00');
    expect(savedFinancials.monthlyExpenses.food).toBe('18000.00');
    expect(screen.queryByTestId('estimates-modal')).not.toBeInTheDocument();
  });

  test('loan management: adds a new loan via Add Loan modal', async () => {
    getCashflowSummary.mockResolvedValue(twoMonthCashflow);
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue(loanFixture);
    createLoan.mockResolvedValue({ loan_id: 'l3', name: 'Education Loan' });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('add-loan-btn')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByTestId('add-loan-btn'));

    expect(screen.getByTestId('loan-modal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /add loan/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/loan name/i), 'Education Loan');
    await user.selectOptions(screen.getByLabelText(/loan type/i), 'EDUCATION');
    await user.type(screen.getByLabelText(/principal \/ outstanding/i), '500000');
    const rateInput = screen.getByLabelText(/annual rate/i);
    await user.clear(rateInput);
    await user.type(rateInput, '9.5');
    const tenureInput = screen.getByLabelText(/tenure \(months\)/i);
    await user.clear(tenureInput);
    await user.type(tenureInput, '60');

    await user.click(screen.getByTestId('save-loan-btn'));

    await waitFor(() => expect(createLoan).toHaveBeenCalledTimes(1));
    expect(createLoan).toHaveBeenCalledWith({
      name: 'Education Loan',
      loan_type: 'EDUCATION',
      principal_paise: 50000000,
      outstanding_paise: 50000000,
      annual_rate: 0.095,
      tenure_months: 60,
    });
    expect(screen.queryByTestId('loan-modal')).not.toBeInTheDocument();
  });

  test('loan management: edits an existing loan via edit button', async () => {
    getCashflowSummary.mockResolvedValue(twoMonthCashflow);
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue(loanFixture);
    updateLoan.mockResolvedValue({ loan_id: 'l1' });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('edit-loan-l1')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByTestId('edit-loan-l1'));

    expect(screen.getByTestId('loan-modal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /edit loan/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/loan name/i)).toHaveValue('Home loan');

    const nameInput = screen.getByLabelText(/loan name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'SBI Home Loan');

    await user.click(screen.getByTestId('save-loan-btn'));

    await waitFor(() => expect(updateLoan).toHaveBeenCalledTimes(1));
    expect(updateLoan.mock.calls[0][0]).toBe('l1');
    expect(updateLoan.mock.calls[0][1].name).toBe('SBI Home Loan');
  });

  test('loan management: deletes a loan with confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    getCashflowSummary.mockResolvedValue(twoMonthCashflow);
    getDashboardProfile.mockResolvedValue(profileFixture);
    listLoans.mockResolvedValue(loanFixture);
    deleteLoan.mockResolvedValue({});
    renderPage();

    await waitFor(() => expect(screen.getByTestId('delete-loan-l1')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByTestId('delete-loan-l1'));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/delete this loan/i));
    await waitFor(() => expect(deleteLoan).toHaveBeenCalledWith('l1'));
  });
});
