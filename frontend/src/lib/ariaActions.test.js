import { describe, expect, test } from 'vitest';
import { actionRequest, isSafeAction, sanitizeProposal } from './ariaActions.js';

describe('ARIA confirmed actions', () => {
  test('accepts only known proposal fields and entities', () => {
    const proposal = sanitizeProposal({ entity: 'transaction_category', operation: 'update', target: 'txn-1', payload: { category: 'DINING', user_id: 'attacker' }, summary: 'Categorize transaction' });
    expect(proposal.payload).toEqual({ category: 'DINING' });
    expect(isSafeAction(proposal)).toBe(true);
  });

  test('rejects unknown or unconfirmed operations', () => {
    expect(isSafeAction({ entity: 'trade', operation: 'create', payload: {} })).toBe(false);
  });

  test('maps transaction proposal to authenticated category endpoint', async () => {
    const request = async (path, options) => ({ path, options });
    const result = await actionRequest({ entity: 'transaction_category', operation: 'update', target: 'txn-1', payload: { category: 'DINING', version: 3 }, summary: 'Categorize transaction' }, request);
    expect(result.path).toBe('/transactions/txn-1/category');
    expect(result.options.method).toBe('PATCH');
  });
});
