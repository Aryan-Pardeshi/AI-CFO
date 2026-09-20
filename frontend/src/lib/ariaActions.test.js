import { describe, expect, test } from 'vitest';
import { actionRequest, isSafeAction, sanitizeProposal } from './ariaActions.js';

describe('ARIA confirmed actions', () => {
  test('accepts only known proposal fields and entities', () => {
    const proposal = sanitizeProposal({ entity: 'transaction_category', operation: 'update', target: 'txn-1', payload: { category: 'DINING', user_id: 'attacker' }, expires_at: '2099-01-01T00:00:00Z', summary: 'Categorize transaction' });
    expect(proposal.payload).toEqual({ category: 'DINING' });
    expect(isSafeAction(proposal)).toBe(true);
  });

  test('rejects unknown or unconfirmed operations', () => {
    expect(isSafeAction({ entity: 'trade', operation: 'create', payload: {} })).toBe(false);
  });

  test('maps transaction proposal to authenticated category endpoint', async () => {
    const request = async (path, options) => ({ path, options });
    const result = await actionRequest({ entity: 'transaction_category', operation: 'update', target: 'txn-1', payload: { category: 'DINING', version: 3 }, expires_at: '2099-01-01T00:00:00Z', summary: 'Categorize transaction' }, request);
    expect(result.path).toBe('/transactions/txn-1/category');
    expect(result.options.method).toBe('PATCH');
  });

  test('requires a future expiry before an action can render or send', async () => {
    expect(isSafeAction({ entity: 'goal', operation: 'update', target: 'g1', payload: { name: 'Car' }, summary: 'Update goal' })).toBe(false);
    await expect(actionRequest({ entity: 'goal', operation: 'update', target: 'g1', payload: { name: 'Car' }, expires_at: '2020-01-01T00:00:00Z', summary: 'Update goal' }, async () => ({}))).rejects.toThrow(/fresh/);
  });

  test.each([
    ['profile', 'update', 'profile', '/me/profile', 'PUT'],
    ['holding', 'update', 'h1', '/holdings/h1', 'PUT'],
    ['goal', 'update', 'g1', '/goals/g1', 'PUT'],
    ['loan', 'update', 'l1', '/loans/l1', 'PUT'],
    ['dashboard_financials', 'update', 'dashboard', '/dashboard/financials', 'PUT'],
  ])('maps %s proposals to authenticated CRUD routes', async (entity, operation, target, path, method) => {
    const request = async (actualPath, options) => ({ path: actualPath, options });
    const payload = entity === 'dashboard_financials' ? { financials: {} } : { name: 'Updated' };
    const result = await actionRequest({ entity, operation, target, payload, expires_at: '2099-01-01T00:00:00Z', summary: 'Update' }, request);
    expect(result.path).toBe(path);
    expect(result.options.method).toBe(method);
  });
});
