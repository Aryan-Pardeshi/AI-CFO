/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RiskStrategy from './RiskStrategy.jsx';

describe('RiskStrategy', () => {
  test('lets a person state their investment risk willingness directly', async () => {
    const user = userEvent.setup();
    render(<RiskStrategy profile={{}} saveAndAdvance={async () => {}} goBack={() => {}} />);

    expect(screen.getAllByRole('group')).toHaveLength(5);
    const willingness = screen.getByRole('group', { name: /how much investment risk are you comfortable taking/i });
    const highRisk = within(willingness).getByRole('button', { name: /high.*accept sharp ups and downs/i });
    await user.click(highRisk);

    expect(highRisk).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/risk profile/i)).toHaveValue('AGGRESSIVE');
  });
});
