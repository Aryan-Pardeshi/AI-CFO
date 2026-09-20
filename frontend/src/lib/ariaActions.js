import { authenticatedRequest } from './api.js';

const ALLOWED = {
  profile: new Set(['name', 'risk_profile', 'investment_horizon_years', 'strategy_goal']),
  holding: new Set(['quantity', 'avg_buy_price_paise', 'manual_current_value_paise']),
  goal: new Set(['name', 'target_amount_paise', 'target_date', 'priority']),
  loan: new Set(['outstanding_principal_paise', 'interest_rate', 'monthly_payment_paise']),
  fire_scenario: new Set(['name', 'inputs']),
  transaction_category: new Set(['category', 'version']),
};

export function sanitizeProposal(proposal) {
  if (!proposal || typeof proposal !== 'object' || !ALLOWED[proposal.entity]) return null;
  if (!['create', 'update', 'delete'].includes(proposal.operation)) return null;
  const payload = proposal.payload && typeof proposal.payload === 'object' && !Array.isArray(proposal.payload)
    ? Object.fromEntries(Object.entries(proposal.payload).filter(([key]) => ALLOWED[proposal.entity].has(key)))
    : {};
  return {
    entity: proposal.entity,
    operation: proposal.operation,
    target: typeof proposal.target === 'string' ? proposal.target : undefined,
    payload,
    summary: typeof proposal.summary === 'string' && proposal.summary
      ? proposal.summary
      : `${proposal.operation} ${proposal.entity.replaceAll('_', ' ')}`,
    version: Number.isInteger(proposal.version) ? proposal.version : undefined,
  };
}

export function isSafeAction(proposal) {
  const safe = sanitizeProposal(proposal);
  return Boolean(safe?.summary && (safe.operation === 'create' || safe.target));
}

export async function actionRequest(proposal, request = authenticatedRequest) {
  const safe = sanitizeProposal(proposal);
  if (!isSafeAction(safe)) throw new Error('This action needs a fresh validated proposal.');
  if (safe.entity === 'transaction_category' && safe.operation === 'update') {
    return request(`/transactions/${encodeURIComponent(safe.target)}/category`, { method: 'PATCH', body: safe.payload });
  }
  if (safe.entity === 'fire_scenario' && safe.operation === 'create') {
    return request('/fire/scenarios', { method: 'POST', body: safe.payload });
  }
  throw new Error('This action is not available yet.');
}
