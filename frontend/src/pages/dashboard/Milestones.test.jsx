/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Milestones from './Milestones.jsx';
import * as api from '../../lib/api.js';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ userEmail: 'demo@example.com' }),
}));

const goals = [
  {
    goal_id: 'g1',
    name: 'Emergency fund',
    goal_type: 'OTHER',
    amount_today_paise: 10000000,
    current_saved_paise: 2500000,
    target_age: 35,
    target_date: '2032-01-01',
  },
];

describe('Milestones page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getMe').mockResolvedValue({ date_of_birth: '1996-05-01', onboarded: true });
    vi.spyOn(api, 'listGoals').mockResolvedValue(goals);
  });

  afterEach(() => {
    cleanup();
  });

  describe('contribution flow', () => {
    test('a successful contribution refetches, converts to paise, and persists the exact canonical shape', async () => {
      const user = userEvent.setup();
      const updated = { ...goals[0], current_saved_paise: 3000000 };
      const updateSpy = vi.spyOn(api, 'updateGoal').mockResolvedValue(updated);

      render(<Milestones />);
      await screen.findByText('Emergency fund');
      await user.click(screen.getByRole('button', { name: /contribute/i }));
      await user.type(screen.getByLabelText(/contribution amount/i), '5000');
      await user.click(screen.getByRole('button', { name: /confirm contribution/i }));

      await waitFor(() => expect(updateSpy).toHaveBeenCalledWith('g1', { current_saved_paise: 3000000 }));
      // Goal id plus exactly that one canonical paise field — nothing else, no user_id.
      expect(Object.keys(updateSpy.mock.calls[0][1])).toEqual(['current_saved_paise']);
      await screen.findByText(/added/i);
    });

    test('a validation failure (non-positive amount) shows a validation error and never calls updateGoal', async () => {
      const user = userEvent.setup();
      const updateSpy = vi.spyOn(api, 'updateGoal');

      render(<Milestones />);
      await screen.findByText('Emergency fund');
      await user.click(screen.getByRole('button', { name: /contribute/i }));
      const amountInput = screen.getByLabelText(/contribution amount/i);
      await user.type(amountInput, '0');
      // The input also carries a native min="0.01" constraint (a real, separate
      // guard), which would block a plain button click before our own
      // onSubmit-level business validation ever ran. Dispatch the submit event
      // directly so this test exercises that JS-level guard specifically.
      fireEvent.submit(amountInput.closest('form'));

      await screen.findByRole('alert');
      expect(updateSpy).not.toHaveBeenCalled();
    });

    test('an update/network failure keeps the dialog open with the error visible', async () => {
      const user = userEvent.setup();
      vi.spyOn(api, 'updateGoal').mockRejectedValue(new Error('network down'));

      render(<Milestones />);
      await screen.findByText('Emergency fund');
      await user.click(screen.getByRole('button', { name: /contribute/i }));
      await user.type(screen.getByLabelText(/contribution amount/i), '100');
      await user.click(screen.getByRole('button', { name: /confirm contribution/i }));

      await screen.findByText(/network down/i);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    test('a stale/missing goal (removed elsewhere before the write) produces a refresh-safe error and never calls updateGoal', async () => {
      const user = userEvent.setup();
      const updateSpy = vi.spyOn(api, 'updateGoal');

      render(<Milestones />);
      await screen.findByText('Emergency fund');
      await user.click(screen.getByRole('button', { name: /contribute/i }));

      // The contribution flow refetches before writing; simulate the goal being
      // gone by the time that refetch lands.
      api.listGoals.mockResolvedValueOnce([]);

      await user.type(screen.getByLabelText(/contribution amount/i), '100');
      await user.click(screen.getByRole('button', { name: /confirm contribution/i }));

      await screen.findByText(/refresh/i);
      expect(updateSpy).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    test('a goal with a missing/null current_saved_paise produces a refresh-safe error and never calls updateGoal', async () => {
      const user = userEvent.setup();
      const updateSpy = vi.spyOn(api, 'updateGoal');

      render(<Milestones />);
      await screen.findByText('Emergency fund');
      await user.click(screen.getByRole('button', { name: /contribute/i }));

      api.listGoals.mockResolvedValueOnce([{ ...goals[0], current_saved_paise: null }]);

      await user.type(screen.getByLabelText(/contribution amount/i), '100');
      await user.click(screen.getByRole('button', { name: /confirm contribution/i }));

      await screen.findByText(/refresh/i);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('accessible dialog semantics', () => {
    test('the dialog exposes role="dialog", aria-modal, an accessible name, and a labelled amount input', async () => {
      const user = userEvent.setup();
      render(<Milestones />);
      await screen.findByText('Emergency fund');
      await user.click(screen.getByRole('button', { name: /contribute/i }));

      const dialog = screen.getByRole('dialog', { name: /contribute to emergency fund/i });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      const amountInput = screen.getByLabelText(/contribution amount/i);
      expect(amountInput.tagName).toBe('INPUT');
    });

    test('focus moves into the dialog when it opens', async () => {
      const user = userEvent.setup();
      render(<Milestones />);
      await screen.findByText('Emergency fund');
      await user.click(screen.getByRole('button', { name: /contribute/i }));

      await waitFor(() => expect(screen.getByLabelText(/contribution amount/i)).toHaveFocus());
    });

    test('Escape closes the dialog when a save is not in flight', async () => {
      const user = userEvent.setup();
      render(<Milestones />);
      await screen.findByText('Emergency fund');
      await user.click(screen.getByRole('button', { name: /contribute/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('a validation error is announced with role="alert"', async () => {
      const user = userEvent.setup();
      render(<Milestones />);
      await screen.findByText('Emergency fund');
      await user.click(screen.getByRole('button', { name: /contribute/i }));
      const amountInput = screen.getByLabelText(/contribution amount/i);
      await user.type(amountInput, '0');
      fireEvent.submit(amountInput.closest('form'));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/positive|greater than zero|must be/i);
    });
  });

  describe('list states', () => {
    test('empty state: no goals shows a clear message and no contribute controls', async () => {
      api.listGoals.mockResolvedValue([]);
      render(<Milestones />);

      await screen.findByText(/no milestones saved yet/i);
      expect(screen.queryByRole('button', { name: /contribute/i })).not.toBeInTheDocument();
    });

    test('load-error state: a failed fetch shows a distinct, retryable error, never a fabricated empty state', async () => {
      api.listGoals.mockRejectedValue(new Error('Service unavailable'));
      render(<Milestones />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/service unavailable/i);
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      // A load failure must never be presented as "you simply have zero goals".
      expect(screen.queryByText(/no milestones saved yet/i)).not.toBeInTheDocument();
    });
  });
});
