/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Holdings from './Holdings.jsx';
import { buildHoldingPayload } from '../../lib/onboarding.js';

const api = vi.hoisted(() => ({
  createHolding: vi.fn(),
  deleteHolding: vi.fn(),
  listHoldings: vi.fn(),
  updateHolding: vi.fn(),
}));

vi.mock('../../lib/api.js', () => api);

function csvFile(text) {
  const file = new File([text], 'holdings.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(text) });
  return file;
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function renderHoldings() {
  return render(<Holdings profile={{}} saveAndAdvance={vi.fn().mockResolvedValue(undefined)} goBack={vi.fn()} />);
}

async function upload(file) {
  const chooser = screen.getByLabelText('Broker holdings CSV');
  await waitFor(() => expect(chooser).not.toBeDisabled());
  await userEvent.setup().upload(chooser, file);
}

describe('Holdings broker CSV import', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    api.listHoldings.mockResolvedValue([]);
    api.createHolding.mockResolvedValue({ holding_id: 'created-1' });
    api.updateHolding.mockResolvedValue({});
  });

  test('shows parsed rows and only creates imported holding on Continue', async () => {
    renderHoldings();

    await upload(csvFile('Symbol,Name,Qty,Avg Cost\nRELIANCE,Reliance Industries,10,2800.50\n'));

    expect(await screen.findByDisplayValue('RELIANCE')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(api.createHolding).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/review rows then press continue/i);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(api.createHolding).toHaveBeenCalledWith(expect.objectContaining({
      asset_type: 'STOCK',
      symbol: 'RELIANCE',
      quantity: 10,
      avg_buy_price_paise: 280050,
      source: 'IMPORTED',
    })));
  });

  test('keeps current rows and reports a funds ledger parser error', async () => {
    renderHoldings();
    const before = screen.getByPlaceholderText('RELIANCE');

    await upload(csvFile('Fund Name,Units,Value\nSome Fund,2,1000\n'));

    expect(await screen.findByRole('status')).toHaveTextContent(/not a holdings export/i);
    expect(screen.getByPlaceholderText('RELIANCE')).toBe(before);
    expect(api.createHolding).not.toHaveBeenCalled();
  });

  test('does not overwrite saved holdings during broker import', async () => {
    api.listHoldings.mockResolvedValue([{
      holding_id: 'saved-1', asset_type: 'STOCK', symbol: 'TCS', name: 'TCS', quantity: 2, avg_buy_price_paise: 100000,
    }]);
    renderHoldings();
    expect((await screen.findAllByDisplayValue('TCS')).length).toBe(2);

    await upload(csvFile('Symbol,Name,Qty,Avg Cost\nRELIANCE,Reliance Industries,10,2800.50\n'));

    expect(await screen.findByRole('status')).toHaveTextContent(/saved holdings cannot be overwritten/i);
    expect(screen.getAllByDisplayValue('TCS')).toHaveLength(2);
    expect(screen.queryByDisplayValue('RELIANCE')).not.toBeInTheDocument();
    expect(api.createHolding).not.toHaveBeenCalled();
    expect(api.updateHolding).not.toHaveBeenCalled();
  });

  test('buildHoldingPayload carries an optional imported source only when provided', () => {
    expect(buildHoldingPayload({ assetType: 'STOCK', symbol: 'RELIANCE', name: 'Reliance', quantity: 10, avgBuyPricePaise: 280050 })).not.toHaveProperty('source');
    expect(buildHoldingPayload({ assetType: 'STOCK', symbol: 'RELIANCE', name: 'Reliance', quantity: 10, avgBuyPricePaise: 280050, source: 'IMPORTED' })).toHaveProperty('source', 'IMPORTED');
  });

  test('waits for the initial holdings check before allowing broker import', async () => {
    const initial = deferred();
    api.listHoldings.mockReturnValue(initial.promise);
    renderHoldings();

    expect(screen.getByLabelText('Broker holdings CSV')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load a demo portfolio' })).toBeDisabled();
    initial.resolve([]);
    await waitFor(() => expect(screen.getByLabelText('Broker holdings CSV')).not.toBeDisabled());
    expect(screen.getByRole('button', { name: 'Load a demo portfolio' })).not.toBeDisabled();
    await upload(csvFile('Symbol,Name,Qty,Avg Cost\nRELIANCE,Reliance Industries,10,2800.50\n'));
    expect(screen.getByDisplayValue('RELIANCE')).toBeInTheDocument();
  });

  test('blocks broker import and saving if saved holdings arrive after a local edit', async () => {
    const initial = deferred();
    api.listHoldings.mockReturnValue(initial.promise);
    renderHoldings();

    await userEvent.setup().click(screen.getByRole('button', { name: '+ Add another holding' }));
    initial.resolve([{ holding_id: 'late-1', asset_type: 'STOCK', symbol: 'TCS', name: 'TCS', quantity: 2, avg_buy_price_paise: 100000 }]);

    expect(await screen.findByRole('status')).toHaveTextContent(/refresh before importing or saving/i);
    expect(screen.getByLabelText('Broker holdings CSV')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load a demo portfolio' })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/refresh this page before saving/i)).toBeInTheDocument();
    expect(api.createHolding).not.toHaveBeenCalled();
  });

  test('disables only the broker chooser while File.text is pending', async () => {
    const textRead = deferred();
    const file = new File(['pending'], 'holdings.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: vi.fn(() => textRead.promise) });
    renderHoldings();
    const user = userEvent.setup();
    const chooser = screen.getByLabelText('Broker holdings CSV');

    const uploadPromise = user.upload(chooser, file);
    await waitFor(() => expect(chooser).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();

    textRead.resolve('Symbol,Name,Qty,Avg Cost\nRELIANCE,Reliance Industries,10,2800.50\n');
    await uploadPromise;
    await waitFor(() => expect(chooser).not.toBeDisabled());
  });
});
